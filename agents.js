(function () {
  const PG = (window.PG = window.PG || {});

  const AGENTS = [
    { id: "reader", name: "读票员" },
    { id: "rule", name: "条款官" },
    { id: "price", name: "比价员" },
    { id: "negotiator", name: "谈判员" },
    { id: "steward", name: "管家" },
    { id: "auditor", name: "审计员" }
  ];

  const money = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "¥—";
    return "¥" + n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  function caseId(ticket) {
    const date = String(ticket.date || "").replace(/-/g, "") || "00000000";
    const tail = String(ticket.id || "").slice(0, 4).toUpperCase();
    return `PG-${date}-${tail || "0000"}`;
  }

  function statusOf(ticket) {
    const actions = ticket.actions || [];
    if (actions.some((a) => ["refunded", "repaired", "promise"].includes(a.status))) return "已办结";
    if ((ticket.windows || []).some((w) => w.status !== "closed" && w.daysLeft !== null && w.daysLeft >= 0)) return "进行中";
    return "待补证据";
  }

  function run(ticket, context) {
    const ctx = context || {};
    const missing = Array.isArray(ticket.missing) ? ticket.missing : [];
    const evidence = Array.isArray(ticket.evidence) ? ticket.evidence : [];
    const review = !!ticket.review;
    const prio = PG.priority ? PG.priority(ticket) : null;
    const checklist = prio && PG.checklistFor ? PG.checklistFor(prio) : [];
    const actionMissing = checklist.filter((item) => !evidence.some((e) => `${e.type}${e.label}${e.detail || ""}`.includes(String(item).slice(0, 2))));
    const missingForAction = prio ? actionMissing : missing;
    const findings = [];

    findings.push({
      id: "reader",
      name: "读票员",
      status: review ? "confirm" : "assert",
      claim: review
        ? "金额或日期的 OCR 置信偏低，先核对再往下走。"
        : `${ticket.merchant || "商家"} · ${money(ticket.amount)} · ${ticket.date || "日期待确认"}，三件事能对上。`,
      detail: review
        ? "我只对字段负责。改字段后，条款和动作会重新计算。"
        : "我只对字段负责，不判断能不能退。原图与 bbox 留在证据里，随时可核对。",
      basis: review ? ["OCR 置信偏低", "需人工确认"] : [`证据 ${evidence.length} 件`, "字段已核对"]
    });

    findings.push({
      id: "rule",
      name: "条款官",
      status: prio ? "assert" : "abstain",
      claim: prio
        ? `${prio.label} ${prio.daysLeft} 天后关闭（${prio.end || "日期待确认"}）。`
        : "这张票目前没有可计算的截止日。",
      detail: prio
        ? `依据：${prio.source || "规则库"}${prio.basis && prio.basis.article ? " · " + prio.basis.article : ""}。日期由规则计算，不由模型改写。`
        : "没有规则或证据时不硬答；补一张带购买日/开票日的票再算。",
      basis: prio ? [prio.basis && prio.basis.article ? prio.basis.article : "规则库", prio.source || "来源待补"] : ["规则缺失", "弃权"]
    });

    const priceCheck = ticket.priceCheck;
    const priceOk = priceCheck && priceCheck.sameModel;
    findings.push({
      id: "price",
      name: "比价员",
      status: priceOk ? "assert" : "abstain",
      claim: priceOk
        ? `同款 ${priceCheck.model} 现价 ${money(priceCheck.price)}，价差 ${money(Number(ticket.amount) - Number(priceCheck.price))}。`
        : priceCheck
          ? `找到 ${money(priceCheck.price)}，但型号是 ${priceCheck.model}，与小票不一致，弃权。`
          : "还没有同款价格证据；相似款不当作同款。",
      detail: priceOk
        ? "型号、规格、渠道、日期四项都对上，才给价差。"
        : priceCheck
          ? "只对同款负责。型号对不上，价差再大也不能用；先确认型号。"
          : "只对同款负责。没有同款证据就弃权，不拿相似款凑数。",
      basis: priceOk ? ["价格页", priceCheck.model, priceCheck.date || "近期"] : priceCheck ? ["价格页", priceCheck.model, "型号不符"] : ["无同款证据", "弃权"]
    });

    const negReady = !review && !missingForAction.length;
    findings.push({
      id: "negotiator",
      name: "谈判员",
      status: negReady ? "assert" : "confirm",
      claim: negReady
        ? `可以起草「${prio ? prio.label : "这件事"}」的申请，引用条款和证据，不代提交。`
        : `先补：${missingForAction.length ? missingForAction.join("、") : "需核对的金额/日期"}，再起草。`,
      detail: negReady
        ? "话术只引用案卷里的事实；不承诺“一定退”，也不替用户点发送。"
        : "事实不足时先要材料；材料齐了再谈，避免把猜测写进申请。",
      basis: negReady ? ["案卷事实", "条款官结论", "拒绝理由库"] : ["材料不足", "先补证据"]
    });

    const subscriptions = typeof PG.detectSubscriptions === "function" ? PG.detectSubscriptions(ctx.tickets || []) : [];
    const coupons = Array.isArray(ctx.coupons) ? ctx.coupons.length : 0;
    const points = Array.isArray(ctx.points) ? ctx.points.reduce((sum, p) => sum + (Number(p.balance) || 0), 0) : 0;
    const hasStewardData = subscriptions.length + coupons + points > 0;
    findings.push({
      id: "steward",
      name: "管家",
      status: hasStewardData ? "assert" : "confirm",
      claim: hasStewardData
        ? `订阅 ${subscriptions.length} 项 · 券 ${coupons} 张 · 积分 ${points.toLocaleString("zh-CN")} 分。`
        : "还没有周期资产；可以补一张券或一笔积分。",
      detail: "我只管会过期的东西：订阅、券、积分、耗材、家庭权限。没有数据就只提醒，不推断。",
      basis: hasStewardData ? ["本地资产", "到期日排序"] : ["暂无数据", "可补录"]
    });

    const veto = review;
    findings.push({
      id: "auditor",
      name: "审计员",
      status: veto ? "veto" : (missingForAction.length || missing.length) ? "confirm" : "assert",
      claim: veto
        ? "OCR 需复核，金额和日期不能进入主行动。"
        : (missingForAction.length || missing.length)
          ? `证据 ${evidence.length} 件，还缺 ${(missingForAction.length ? missingForAction : missing).join("、")}；结论先标“待补”。`
          : `证据 ${evidence.length} 件，主行动所需依据齐全。`,
      detail: "我逐条核对证据引用。没有原文、没有条款号、金额对不上，都不能进入主行动；被否决的结论仍留在案卷里。",
      basis: [`证据 ${evidence.length} 件`, (missingForAction.length || missing.length) ? `还缺 ${(missingForAction.length || missing.length)} 件` : "无缺口", veto ? "否决" : "已核对"]
    });

    let conflict = null;
    if (veto) {
      conflict = {
        tone: "seal",
        title: "审计员否决：金额/日期需先核对",
        body: "OCR 置信偏低时，价差和期限都不能当作确定结论。先改字段，再重算。",
        action: "edit"
      };
    } else if (!priceOk) {
      const hasPrice = !!priceCheck;
      conflict = {
        tone: "amber",
        title: hasPrice ? "比价员弃权：型号对不上" : "比价员弃权：没有同款证据",
        body: hasPrice
          ? `比价员找到 ${money(priceCheck.price)}，但页面型号是 ${priceCheck.model}；型号对不上，价差结论不进入主行动。`
          : "没有型号、规格、渠道都能对上的价格页，价差结论不进入主行动。",
        action: "none"
      };
    }

    let primary;
    if (veto) {
      primary = { label: "先核对金额和日期", detail: "改完字段后，六方会重新合议。", action: "edit" };
    } else if (prio) {
      primary = {
        label: `去办：${prio.label}`,
        detail: `${prio.daysLeft} 天后关闭。${missingForAction.length ? "还缺 " + missingForAction.join("、") + "，可以边办边补。" : "证据已齐，按步骤走。"}`,
        action: "action"
      };
    } else {
      primary = { label: "补一张带金额和日期的票", detail: "没有截止日，先补证据再判断。", action: "import" };
    }

    return {
      caseId: caseId(ticket),
      status: statusOf(ticket),
      findings,
      conflict,
      primary,
      agents: AGENTS,
      headline: veto ? "这宗案卷先核对，再往下办。" : prio ? `${prio.label} ${prio.daysLeft} 天后关闭。` : "这宗案卷暂时没有截止日。"
    };
  }

  PG.agents = { list: AGENTS, run, caseId, statusOf };
})();
