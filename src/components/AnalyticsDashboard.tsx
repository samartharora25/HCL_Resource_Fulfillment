import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ParseResult } from '../lib/parsing';
import { aggregateByCluster, aggregateByLocation } from '../lib/aggregation';
import { calculateHealthScore } from '../lib/healthScore';
import { thresholdClusters, SEED_TAXONOMY } from '../lib/clustering';
import { calculateTrends } from '../lib/trendAnalysis';
import { Card, Badge, Button } from './ui';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, CartesianGrid, LineChart, Line, RadarChart,
  Radar, PolarGrid, PolarAngleAxis
} from 'recharts';
import {
  AlertCircle, MessageSquare, TrendingUp, TrendingDown, X, Zap, Award,
  Compass, Send, Users, UserCheck, Clock, AlertTriangle, ChevronRight,
  BarChart2, HelpCircle, Layers, Search, BookOpen, GitBranch, MapPin,
  FileText, ThumbsUp, Activity, Info
} from 'lucide-react';

interface ChatMessage {
  sender: 'user' | 'assistant';
  text: string;
  isTyping?: boolean;
}

type TabId = 'dashboard' | 'skills' | 'trends' | 'bottlenecks' | 'recs' | 'investigate' | 'agent';

// ─── NAV CONFIG ────────────────────────────────────────────────────────────────
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard',    label: 'Executive Dashboard', icon: <BarChart2 size={15} /> },
  { id: 'skills',       label: 'Skill Analysis',       icon: <Layers size={15} /> },
  { id: 'trends',       label: 'Demand Trends',         icon: <TrendingUp size={15} /> },
  { id: 'bottlenecks',  label: 'Bottleneck Engine',     icon: <AlertTriangle size={15} /> },
  { id: 'recs',         label: 'Recommendations',       icon: <ThumbsUp size={15} /> },
  { id: 'investigate',  label: 'Investigation',         icon: <Search size={15} /> },
  { id: 'agent',        label: 'AI Agent',              icon: <MessageSquare size={15} /> },
];

// ─── PILL STYLE HELPER ─────────────────────────────────────────────────────────
const pill = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 10px', borderRadius: '20px',
  fontSize: '11px', fontWeight: 700, background: bg, color,
});

export function AnalyticsDashboard({ parseResult }: { parseResult: ParseResult }) {
  const records = parseResult.validationResult.validData;

  // ─── States ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [selectedCluster, setSelectedCluster]   = useState<string | null>(null);
  const [mixDrillCluster, setMixDrillCluster]   = useState<string | null>(null);
  const [showSummaryDetail, setShowSummaryDetail] = useState(false);
  const [trendingInfoOpen, setTrendingInfoOpen]  = useState(false);
  const [investigateTarget, setInvestigateTarget] = useState<{ type: 'skill' | 'location'; key: string } | null>(null);
  const [invMode, setInvMode] = useState<'skill' | 'location' | 'rec'>('skill');

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { sender: 'assistant', text: 'Hello! I am your HCL Fulfillment Assistant.\n\nI can generate reports, explain trends, identify risks, and answer questions about your data. Use the report buttons above or type a question below.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // ─── Calculations ───────────────────────────────────────────────────────────
  const clusterMapping  = useMemo(() => thresholdClusters(records), [records]);
  const mappedRecords   = useMemo(() => records.map(r => ({ ...r, skillCluster: clusterMapping[r.skillCluster] || r.skillCluster })), [records, clusterMapping]);
  const clusterMetrics  = useMemo(() => aggregateByCluster(mappedRecords), [mappedRecords]);
  const locationMetrics = useMemo(() => aggregateByLocation(mappedRecords), [mappedRecords]);

  const healthScores = useMemo(() =>
    clusterMetrics.map(m => ({ cluster: m.cluster, metrics: m, health: calculateHealthScore(m) }))
      .sort((a, b) => a.health.score - b.health.score),
  [clusterMetrics]);

  // Trends split
  const trendsData = useMemo(() => {
    if (records.length < 2) return [];
    const sorted = records.map(r => r.raisedDate.getTime()).filter(t => !isNaN(t)).sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] || Date.now();
    const prev: Record<string, number> = {};
    const curr: Record<string, number> = {};
    mappedRecords.forEach(r => {
      const cluster = r.skillCluster;
      if (r.raisedDate.getTime() < mid) prev[cluster] = (prev[cluster] || 0) + 1;
      else curr[cluster] = (curr[cluster] || 0) + 1;
    });
    return calculateTrends(prev, curr, { magnitudeThresholdPercent: 10, minVolumeFloor: 1 });
  }, [records, mappedRecords]);

  // Bottlenecks
  const bottlenecks = useMemo(() => {
    const list: { cluster: string; avgLeadTime: number; openReqs: number; severity: 'Critical' | 'High' | 'Medium'; rootCause: string; rootCauseType: 'Skill Shortage' | 'Approval Delay' | 'Hiring Delay' }[] = [];
    healthScores.forEach(({ cluster, metrics, health }) => {
      if (health.score < 75) {
        let severity: 'Critical' | 'High' | 'Medium' = 'Medium';
        if (health.score < 50) severity = 'Critical';
        else if (health.score < 65) severity = 'High';
        const isInternalSlow = metrics.avgLeadTimeInternal > metrics.avgLeadTimeExternal;
        const rootCauseType = health.score < 50 ? 'Skill Shortage' : isInternalSlow ? 'Approval Delay' : 'Hiring Delay';
        const rootCause = rootCauseType === 'Skill Shortage'
          ? 'Acute talent shortage — both internal bench and external market are constrained.'
          : rootCauseType === 'Approval Delay'
          ? 'Internal bench exists but transfer approvals are slow. Streamline HR routing.'
          : 'External recruitment pipeline bottleneck — sourcing latency or candidate screening overhead.';
        list.push({ cluster, avgLeadTime: metrics.avgLeadTimeDays, openReqs: metrics.openReqsCount, severity, rootCause, rootCauseType });
      }
    });
    return list.sort((a, b) => a.severity === 'Critical' ? -1 : b.severity === 'Critical' ? 1 : 0);
  }, [healthScores]);

  // Root cause breakdown for pie
  const rootCausePieData = useMemo(() => {
    const counts: Record<string, number> = { 'Skill Shortage': 0, 'Approval Delay': 0, 'Hiring Delay': 0 };
    bottlenecks.forEach(b => counts[b.rootCauseType]++);
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [bottlenecks]);

  // Recommendations
  const recommendations = useMemo(() => {
    const list: { id: string; title: string; category: string; description: string; impact: string; priority: number }[] = [];
    const sapM = clusterMetrics.find(m => m.cluster.toLowerCase().includes('sap'));
    if (sapM && sapM.avgLeadTimeExternal > 50) list.push({ id: 'rec-sap', title: 'Optimize SAP Vendor Channel', category: 'External Recruitment', description: `SAP external lead time averages ${sapM.avgLeadTimeExternal} days. Negotiate SLA milestones with preferred suppliers or introduce tier-2 agencies.`, impact: 'Reduce SAP lead time by 15-20 days', priority: 1 });
    const cloudM = clusterMetrics.find(m => m.cluster.toLowerCase().includes('cloud'));
    if (cloudM && cloudM.avgLeadTimeExternal > 45) list.push({ id: 'rec-cloud', title: 'Establish Cloud Academy Bench Cohort', category: 'Internal Upskilling', description: `Cloud external lead time ${cloudM.avgLeadTimeExternal} days. Train adjacent devs through a structured cloud path.`, impact: 'Decrease lead time from 45+ to 20 days', priority: 2 });
    const devM = clusterMetrics.find(m => m.cluster.toLowerCase().includes('programming') || m.cluster.toLowerCase().includes('stack'));
    if (devM && devM.internalPercent < 50) list.push({ id: 'rec-dev', title: 'Prioritize Internal Mobility for Full-Stack', category: 'Bench Sourcing', description: `Internal fulfillment for Full-Stack stands at ${Math.round(devM.internalPercent)}%. Promote internal rotations and referral bonuses.`, impact: 'Save external placement costs', priority: 2 });
    const slowLoc = Object.entries(locationMetrics).reduce((a, b) => b[1] > a[1] ? b : a, ['', 0]);
    if (slowLoc[0] && slowLoc[1] > 60) list.push({ id: 'rec-loc', title: `Decentralize Sourcing for ${slowLoc[0]}`, category: 'Geographic Allocation', description: `Avg lead time in ${slowLoc[0]} is ${slowLoc[1]} days. Adopt remote-first or multi-hub hybrid hiring.`, impact: 'Shorten hiring cycles by 25%', priority: 1 });
    list.push({ id: 'rec-std-1', title: 'Link Pre-Sales Pipeline to Sourcing', category: 'Demand Sourcing', description: 'Sync recruiting pipelines with CRM sales pipeline stages to forecast demand 30-45 days ahead.', impact: 'Reduce proactive lead times', priority: 3 });
    list.push({ id: 'rec-std-2', title: 'Optimize Internal Approval Workflows', category: 'Process Sourcing', description: 'Streamline executive approval steps for internal transfers. Replace manual email approvals with portal routing.', impact: 'Save 4-6 days of administrative delay', priority: 3 });
    return list.sort((a, b) => a.priority - b.priority);
  }, [clusterMetrics, locationMetrics]);

  // Drilldown helpers
  const getDrilldownLocationData = (cluster: string) => {
    const locMap = new Map<string, number[]>();
    mappedRecords.forEach(r => {
      if (r.skillCluster === cluster && r.location && r.leadTimeDays !== null) {
        const loc = r.location.trim() || 'Unknown';
        if (!locMap.has(loc)) locMap.set(loc, []);
        locMap.get(loc)!.push(r.leadTimeDays);
      }
    });
    const list: { name: string; time: number }[] = [];
    locMap.forEach((times, name) => list.push({ name, time: Math.round(times.reduce((a,b) => a+b,0)/times.length) }));
    return list.sort((a, b) => b.time - a.time);
  };

  // ─── Derived stats for report generation ────────────────────────────────────
  const totalRecords = records.length;
  const internalCount = records.filter(r => r.hiringType === 'Internal').length;
  const externalCount = records.filter(r => r.hiringType === 'External').length;
  const internalPct = Math.round((internalCount / (totalRecords || 1)) * 100);
  const externalPct = 100 - internalPct;
  const intLeadRecs = records.filter(r => r.hiringType === 'Internal' && r.leadTimeDays !== null);
  const extLeadRecs = records.filter(r => r.hiringType === 'External' && r.leadTimeDays !== null);
  const avgIntLead = intLeadRecs.length ? Math.round(intLeadRecs.reduce((a,r) => a+(r.leadTimeDays as number),0)/intLeadRecs.length) : 0;
  const avgExtLead = extLeadRecs.length ? Math.round(extLeadRecs.reduce((a,r) => a+(r.leadTimeDays as number),0)/extLeadRecs.length) : 0;
  const leadGap = avgExtLead - avgIntLead;
  const overdepRisk = externalPct > 55 ? 'High' : externalPct > 40 ? 'Medium' : 'Low';
  const overdepColor = overdepRisk === 'High' ? '#ef4444' : overdepRisk === 'Medium' ? '#f59e0b' : '#10b981';
  const atRiskClusters = healthScores.filter(h => h.health.band === 'At Risk');
  const heaviestExtCluster = [...clusterMetrics].sort((a,b) => b.externalPercent - a.externalPercent)[0];
  const slowestExtCluster = [...clusterMetrics].sort((a,b) => b.avgLeadTimeExternal - a.avgLeadTimeExternal)[0];
  const allLocs = Object.entries(locationMetrics).sort((a,b) => b[1]-a[1]);
  const slowestLoc = allLocs[0];
  const trendingClusters = trendsData.filter(t => t.isTrending);

  // ─── Chat ──────────────────────────────────────────────────────────────────
  const generateLocalReport = (type: string): string => {
    switch (type) {
      case 'executive':
        return `📋 EXECUTIVE SUMMARY REPORT\n${'─'.repeat(40)}\n\n📊 Dataset: ${totalRecords.toLocaleString()} valid records\n👥 Hiring Mix: ${internalPct}% Internal / ${externalPct}% External\n⏱ Avg Lead Time: Internal ${avgIntLead}d | External ${avgExtLead}d | Gap +${leadGap}d\n⚠️ Overdependence Risk: ${overdepRisk}\n🔴 At-Risk Clusters: ${atRiskClusters.length > 0 ? atRiskClusters.map(c=>c.cluster).join(', ') : 'None'}\n\n📝 Narrative:\nThis dataset covers ${totalRecords.toLocaleString()} fulfillment records with a hiring split of ${internalPct}% internal and ${externalPct}% external. Internal sourcing averages ${avgIntLead} days vs. external at ${avgExtLead} days — a gap of ${leadGap > 0 ? '+' : ''}${leadGap} days. Overdependence on external hiring is rated ${overdepRisk}. ${heaviestExtCluster ? `The highest external-reliance cluster is ${heaviestExtCluster.cluster} at ${Math.round(heaviestExtCluster.externalPercent)}% external.` : ''} ${slowestLoc ? `${slowestLoc[0]} is the slowest sourcing location at ${slowestLoc[1]} days.` : ''}`;

      case 'trend':
        const trendLines = trendingClusters.slice(0,5).map(t => `  • ${t.cluster}: ${t.previousVolume} → ${t.currentVolume} reqs (${t.growthPercent !== null ? `+${Math.round(t.growthPercent)}%` : 'New'})`).join('\n');
        return `📈 TREND EXPLANATION REPORT\n${'─'.repeat(40)}\n\n🔍 Trending Methodology:\nA skill cluster is marked "Trending" when:\n  1. Volume growth ≥ 10% between Period 1 and Period 2\n  2. Current period volume ≥ 1 record (minimum floor)\n\nPeriod split: chronological midpoint of all requisition dates.\n\n🚀 Currently Trending Clusters (${trendingClusters.length}):\n${trendLines || '  No clusters meet trending threshold yet.'}\n\n📌 Interpretation:\nTrending clusters signal accelerating demand. Prioritize pre-building talent pipelines for these skills 30-45 days ahead of formal resource requests.`;

      case 'risk':
        const riskLines = bottlenecks.map(b => `  [${b.severity}] ${b.cluster}\n    Root Cause: ${b.rootCauseType} — ${b.rootCause}\n    Avg Lead Time: ${b.avgLeadTime}d | Open Reqs: ${b.openReqs}`).join('\n\n');
        return `⚠️ RISK REPORT\n${'─'.repeat(40)}\n\nTotal Bottlenecks Detected: ${bottlenecks.length}\n  🔴 Critical: ${bottlenecks.filter(b=>b.severity==='Critical').length}\n  🟠 High: ${bottlenecks.filter(b=>b.severity==='High').length}\n  🟡 Medium: ${bottlenecks.filter(b=>b.severity==='Medium').length}\n\n📋 Detailed Issues:\n${riskLines || '  No bottlenecks detected. All clusters within healthy thresholds.'}\n\n🛠 Root Cause Distribution:\n  Skill Shortage: ${bottlenecks.filter(b=>b.rootCauseType==='Skill Shortage').length} clusters\n  Approval Delay: ${bottlenecks.filter(b=>b.rootCauseType==='Approval Delay').length} clusters\n  Hiring Delay: ${bottlenecks.filter(b=>b.rootCauseType==='Hiring Delay').length} clusters`;

      case 'recs':
        const recLines = recommendations.map((r,i) => `  ${i+1}. [${r.category}] ${r.title}\n     ${r.description}\n     💡 Impact: ${r.impact}`).join('\n\n');
        return `💡 RECOMMENDATION SUMMARY\n${'─'.repeat(40)}\n\nTotal Recommendations: ${recommendations.length}\n\n${recLines}`;

      case 'full':
        return `📄 FULL ANALYSIS REPORT\n${'─'.repeat(40)}\n\n${generateLocalReport('executive')}\n\n\n${generateLocalReport('trend')}\n\n\n${generateLocalReport('risk')}\n\n\n${generateLocalReport('recs')}`;

      default:
        const q = type.toLowerCase();
        if (q.includes('risk') || q.includes('health') || q.includes('critical')) return generateLocalReport('risk');
        if (q.includes('trend') || q.includes('growing')) return generateLocalReport('trend');
        if (q.includes('recommend') || q.includes('suggest') || q.includes('action')) return generateLocalReport('recs');
        if (q.includes('summary') || q.includes('executive') || q.includes('overview')) return generateLocalReport('executive');
        if (q.includes('lead time') || q.includes('days') || q.includes('slow')) {
          const sorted = [...clusterMetrics].sort((a,b)=>b.avgLeadTimeDays-a.avgLeadTimeDays);
          return `⏱ LEAD TIME INSIGHTS\n${'─'.repeat(30)}\n\nSlowest: ${sorted[0]?.cluster} (${sorted[0]?.avgLeadTimeDays} days)\nFastest: ${sorted[sorted.length-1]?.cluster} (${sorted[sorted.length-1]?.avgLeadTimeDays} days)\n\nInternal avg: ${avgIntLead} days\nExternal avg: ${avgExtLead} days\nGap: ${leadGap > 0 ? '+' : ''}${leadGap} days`;
        }
        if (q.includes('location') || q.includes('city')) {
          return `📍 LOCATION SOURCING\n${'─'.repeat(30)}\n\nSlowest: ${slowestLoc?.[0]} (${slowestLoc?.[1]} days)\nFastest: ${allLocs[allLocs.length-1]?.[0]} (${allLocs[allLocs.length-1]?.[1]} days)\n\nAll locations ranked:\n${allLocs.map(([l,t]) => `  ${l}: ${t} days`).join('\n')}`;
        }
        return `I can help with:\n• "Show executive summary"\n• "Explain trending skills"\n• "Show risk report"\n• "List recommendations"\n• "Lead time analysis"\n• "Location breakdown"`;
    }
  };

  const handleChatSubmit = (textToSend: string) => {
    if (!textToSend.trim()) return;
    setChatMessages(prev => [...prev, { sender: 'user', text: textToSend }]);
    setChatInput('');
    setChatMessages(prev => [...prev, { sender: 'assistant', text: '...', isTyping: true }]);
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setTimeout(() => {
        const r = generateLocalReport(textToSend);
        setChatMessages(prev => [...prev.filter(m => !m.isTyping), { sender: 'assistant', text: r }]);
      }, 600);
      return;
    }
    const ctx = { totalRecords, internalPct, externalPct, avgIntLead, avgExtLead, leadGap, overdepRisk, atRiskClusters: atRiskClusters.map(c=>c.cluster), trendingClusters: trendingClusters.map(t=>t.cluster), bottlenecks: bottlenecks.length, topRecommendations: recommendations.slice(0,3).map(r=>r.title) };
    const prompt = `You are the HCL Resource Fulfillment Analytics Assistant. Dataset context: ${JSON.stringify(ctx, null, 2)}\n\nAnswer concisely and professionally. Use markdown for structure. User: "${textToSend}"`;
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }).then(r => { if (!r.ok) throw new Error('API error'); return r.json(); })
      .then(d => {
        const text = d?.candidates?.[0]?.content?.parts?.[0]?.text || generateLocalReport(textToSend);
        setChatMessages(prev => [...prev.filter(m => !m.isTyping), { sender: 'assistant', text }]);
      })
      .catch(() => {
        const r = generateLocalReport(textToSend) + '\n\n*(Gemini API unavailable — showing local analysis)*';
        setChatMessages(prev => [...prev.filter(m => !m.isTyping), { sender: 'assistant', text: r }]);
      });
  };

  // ─── Shared Tab Button Style ─────────────────────────────────────────────────
  const tabBtn = (id: TabId): React.CSSProperties => ({
    padding: '10px 16px', fontWeight: 600, fontSize: '13px', border: 'none',
    background: activeTab === id ? 'var(--hcl-purple)' : 'transparent',
    color: activeTab === id ? 'white' : 'var(--hcl-neutral-400)',
    borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
    gap: '6px', whiteSpace: 'nowrap', transition: 'all 0.15s',
  });

  // ─── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* ── Top Navigation Bar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '4px', background: 'var(--hcl-neutral-100)', padding: '6px', borderRadius: '12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={tabBtn(t.id)}
            onMouseEnter={e => { if (activeTab !== t.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(107,63,160,0.08)'; }}
            onMouseLeave={e => { if (activeTab !== t.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 1 — EXECUTIVE DASHBOARD
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

          {/* KPI Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
            {[
              { icon: <BarChart2 size={18} color="var(--hcl-neutral-400)" />, label: 'Total Records', value: totalRecords.toLocaleString(), sub: 'valid rows', color: 'var(--hcl-ink)' },
              { icon: <UserCheck size={18} color="#6b3fa0" />, label: 'Internal Hires', value: internalCount.toLocaleString(), sub: `${internalPct}% of total`, color: '#6b3fa0' },
              { icon: <Users size={18} color="#38bdf8" />, label: 'External Hires', value: externalCount.toLocaleString(), sub: `${externalPct}% of total`, color: '#38bdf8' },
              { icon: <Clock size={18} color="#6b3fa0" />, label: 'Avg Lead (Int)', value: `${avgIntLead}d`, sub: 'days to fill', color: '#6b3fa0' },
              { icon: <Clock size={18} color="#38bdf8" />, label: 'Avg Lead (Ext)', value: `${avgExtLead}d`, sub: 'days to fill', color: '#38bdf8' },
              { icon: <AlertTriangle size={18} color={overdepColor} />, label: 'Overdep. Risk', value: overdepRisk, sub: `Ext ${externalPct}% of mix`, color: overdepColor },
            ].map((k, i) => (
              <Card key={i} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>{k.icon}<span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--hcl-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</span></div>
                <div style={{ fontSize: '26px', fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--hcl-neutral-400)' }}>{k.sub}</div>
              </Card>
            ))}
          </div>

          {/* Main 2-col layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', alignItems: 'start' }}>

            {/* LEFT: Health Score + Heatmap */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <Card>
                <h3 style={{ marginTop: 0, marginBottom: '6px', fontSize: '15px' }}>Fulfillment Health Score</h3>
                <p style={{ fontSize: '12px', color: 'var(--hcl-neutral-400)', marginBottom: '16px', marginTop: 0 }}>Click any row to open detailed drill-down.</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead><tr style={{ borderBottom: '2px solid var(--hcl-neutral-200)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Skill Cluster</th>
                    <th style={{ textAlign: 'right', padding: '10px 0', fontWeight: 600 }}>Score</th>
                    <th style={{ textAlign: 'center', padding: '10px 0', fontWeight: 600 }}>Status</th>
                  </tr></thead>
                  <tbody>
                    {healthScores.map(({ cluster, health }) => (
                      <tr key={cluster} onClick={() => setSelectedCluster(cluster)} style={{ borderBottom: '1px solid var(--hcl-neutral-100)', cursor: 'pointer', transition: 'background-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(100,60,200,0.04)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                        <td style={{ padding: '10px 0', fontWeight: 500, color: 'var(--hcl-purple)' }}>{cluster}{health.exposureMultiplier > 0 && <span style={{ fontSize: '11px', color: 'var(--hcl-neutral-400)', fontWeight: 'normal', marginLeft: 6 }}>({health.exposureMultiplier} open)</span>}</td>
                        <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 700 }}>{health.score}</td>
                        <td style={{ padding: '10px 0', textAlign: 'center' }}><Badge variant={health.band === 'Healthy' ? 'success' : health.band === 'Watch' ? 'warning' : 'error'}>{health.band}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Location heatmap */}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>Lead Time Heatmap by Location</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--hcl-neutral-400)' }}>
                    {[['#10b981','Fast'],['#f59e0b','Moderate'],['#ef4444','Slow']].map(([c,l]) => (
                      <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block' }} />{l}</span>
                    ))}
                  </div>
                </div>
                {(() => {
                  const entries = Object.entries(locationMetrics).sort((a,b) => b[1]-a[1]);
                  const maxT = entries[0]?.[1] || 1;
                  const gc = (t: number) => { const r = t/maxT; return r >= 0.75 ? {bg:'#fef2f2',border:'#fca5a5',text:'#dc2626'} : r >= 0.5 ? {bg:'#fffbeb',border:'#fcd34d',text:'#b45309'} : r >= 0.3 ? {bg:'#ecfdf5',border:'#6ee7b7',text:'#047857'} : {bg:'#f0fdf4',border:'#86efac',text:'#15803d'}; };
                  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {entries.map(([loc, time]) => { const c = gc(time); return (
                      <div key={loc} title={`${loc}: ${time}d`} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: '8px', padding: '8px 10px', cursor: 'default', transition: 'transform 0.15s, box-shadow 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform='scale(1.03)'; (e.currentTarget as HTMLDivElement).style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform='scale(1)'; (e.currentTarget as HTMLDivElement).style.boxShadow='none'; }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--hcl-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{loc}</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: c.text }}>{time}d</span>
                      </div>
                    ); })}
                  </div>;
                })()}
              </Card>
            </div>

            {/* RIGHT: Int vs Ext panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <Card>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>Internal vs External Analysis</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--hcl-neutral-400)' }}>Click a pie slice to highlight</p>
                </div>
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                  <div style={{ flexShrink: 0, width: 180, height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[{name:'Internal',value:internalCount},{name:'External',value:externalCount}]} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value" onClick={(d: any) => setMixDrillCluster(d.name === mixDrillCluster ? null : d.name)} style={{ cursor: 'pointer' }}>
                          {['#6b3fa0','#38bdf8'].map((c,i) => <Cell key={i} fill={c} opacity={mixDrillCluster && mixDrillCluster !== (['Internal','External'][i]) ? 0.4 : 1} />)}
                        </Pie>
                        <RechartsTooltip formatter={(v: any, n: any) => [`${v} (${Math.round((v/totalRecords)*100)}%)`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[{label:'Internal',count:internalCount,pct:internalPct,lead:avgIntLead,color:'#6b3fa0',bg:'rgba(107,63,160,0.07)'},{label:'External',count:externalCount,pct:externalPct,lead:avgExtLead,color:'#38bdf8',bg:'rgba(56,189,248,0.08)'}].map(s => (
                      <div key={s.label} style={{ background: s.bg, borderRadius: '10px', padding: '12px 14px', border: `1px solid ${s.color}22` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}><span style={{ fontWeight: 700, fontSize: '13px', color: s.color }}>{s.label}</span><span style={{ fontWeight: 600, fontSize: '22px', color: s.color }}>{s.pct}%</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--hcl-neutral-400)' }}><span>{s.count.toLocaleString()} hires</span><span>Avg {s.lead}d</span></div>
                        <div style={{ marginTop: '8px', height: '4px', borderRadius: '2px', background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}><div style={{ width: `${s.pct}%`, height: '100%', background: s.color, borderRadius: '2px', transition: 'width 0.5s' }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card>
                <h3 style={{ marginTop: 0, marginBottom: '8px', fontSize: '15px' }}>Hiring Mix by Skill Cluster</h3>
                <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--hcl-neutral-400)' }}>Click a bar to open cluster detail</p>
                <div style={{ height: `${clusterMetrics.length * 44 + 40}px`, minHeight: '200px', maxHeight: '600px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...clusterMetrics].sort((a,b)=>b.externalPercent-a.externalPercent)} layout="vertical" margin={{ left:0, right:24, top:4, bottom:4 }} onClick={(d: any) => { if (d?.activePayload) setSelectedCluster(d.activePayload[0]?.payload?.cluster); }}>
                      <XAxis type="number" domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="cluster" width={170} tick={{ fontSize: 11, fill: 'var(--hcl-ink)' }} />
                      <RechartsTooltip formatter={(v: any, n: any) => [`${Math.round(Number(v))}%`, n]} contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                      <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                      <Bar dataKey="internalPercent" name="Internal %" stackId="mix" fill="#6b3fa0" style={{ cursor: 'pointer' }} />
                      <Bar dataKey="externalPercent" name="External %" stackId="mix" fill="#38bdf8" radius={[0,3,3,0]} style={{ cursor: 'pointer' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <h3 style={{ marginTop: 0, marginBottom: '8px', fontSize: '15px' }}>Lead Time Gap Analysis</h3>
                <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--hcl-neutral-400)' }}>Internal vs External days per cluster</p>
                <div style={{ height: `${clusterMetrics.length * 44 + 40}px`, minHeight: '200px', maxHeight: '500px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...clusterMetrics].sort((a,b)=>b.avgLeadTimeExternal-a.avgLeadTimeExternal)} layout="vertical" margin={{ left:0, right:24, top:4, bottom:4 }} onClick={(d: any) => { if (d?.activePayload) setSelectedCluster(d.activePayload[0]?.payload?.cluster); }}>
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="cluster" width={170} tick={{ fontSize: 11, fill: 'var(--hcl-ink)' }} />
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--hcl-neutral-100)" />
                      <RechartsTooltip formatter={(v: any, n: any) => [`${v} days`, n]} contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                      <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                      <Bar dataKey="avgLeadTimeInternal" name="Internal (days)" fill="#6b3fa0" barSize={12} radius={[0,3,3,0]} style={{ cursor: 'pointer' }} />
                      <Bar dataKey="avgLeadTimeExternal" name="External (days)" fill="#38bdf8" barSize={12} radius={[0,3,3,0]} style={{ cursor: 'pointer' }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </div>

          {/* Summary Report */}
          <Card style={{ background: 'linear-gradient(135deg, rgba(107,63,160,0.04) 0%, rgba(56,189,248,0.04) 100%)', border: '1px solid rgba(107,63,160,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--hcl-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Award size={18} color="white" /></div>
                <div><h3 style={{ margin: 0, fontSize: '16px' }}>Executive Summary Report</h3><p style={{ margin: 0, fontSize: '12px', color: 'var(--hcl-neutral-400)' }}>Auto-generated · {totalRecords.toLocaleString()} records</p></div>
              </div>
              <button onClick={() => setShowSummaryDetail(!showSummaryDetail)} style={{ background: 'none', border: '1px solid var(--hcl-neutral-200)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--hcl-neutral-400)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {showSummaryDetail ? 'Collapse' : 'Expand Details'} <ChevronRight size={14} style={{ transform: showSummaryDetail ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Internal Fulfillment', value: `${internalPct}%`, trend: internalPct >= 50 ? '✓ Healthy mix' : '⚠ Over-reliant on external', color: internalPct >= 50 ? '#10b981' : '#f59e0b' },
                { label: 'External Fulfillment', value: `${externalPct}%`, trend: overdepRisk + ' overdependence risk', color: overdepColor },
                { label: 'Lead Time Gap', value: leadGap > 0 ? `+${leadGap}d` : `${leadGap}d`, trend: `External is ${Math.abs(leadGap)}d ${leadGap > 0 ? 'slower' : 'faster'}`, color: leadGap > 15 ? '#ef4444' : leadGap > 0 ? '#f59e0b' : '#10b981' },
                { label: 'At-Risk Clusters', value: atRiskClusters.length.toString(), trend: atRiskClusters.length > 0 ? atRiskClusters.slice(0,2).map(c=>c.cluster).join(', ') : 'All healthy', color: atRiskClusters.length > 0 ? '#ef4444' : '#10b981' }
              ].map((m, i) => (
                <div key={i} style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--hcl-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{m.label}</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: m.color, marginBottom: '4px' }}>{m.value}</div>
                  <div style={{ fontSize: '11px', color: m.color, fontWeight: 500 }}>{m.trend}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--hcl-ink)', background: 'white', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <strong>Summary:</strong> This dataset covers <strong>{totalRecords.toLocaleString()} records</strong> with <strong style={{ color: '#6b3fa0' }}>{internalPct}% internal</strong> / <strong style={{ color: '#38bdf8' }}>{externalPct}% external</strong> split. Internal avg: <strong>{avgIntLead}d</strong>, External: <strong>{avgExtLead}d</strong>, gap <strong style={{ color: leadGap > 10 ? '#ef4444' : '#10b981' }}>{leadGap > 0 ? '+' : ''}{leadGap}d</strong>. Overdependence rated <strong style={{ color: overdepColor }}>{overdepRisk}</strong>.{heaviestExtCluster && <span> Highest external reliance: <strong>{heaviestExtCluster.cluster}</strong> ({Math.round(heaviestExtCluster.externalPercent)}%).</span>}{slowestLoc && <span> Slowest location: <strong>{slowestLoc[0]}</strong> ({slowestLoc[1]}d).</span>}{atRiskClusters.length > 0 ? <span> <strong style={{ color: '#ef4444' }}>{atRiskClusters.length} cluster{atRiskClusters.length > 1 ? 's' : ''} at risk</strong>: {atRiskClusters.map(c=>c.cluster).join(', ')}.</span> : <span> All clusters in <strong style={{ color: '#10b981' }}>Healthy or Watch</strong> status.</span>}
            </div>
            {showSummaryDetail && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 600, color: 'var(--hcl-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Per-Cluster Breakdown</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {[...clusterMetrics].sort((a,b)=>b.externalPercent-a.externalPercent).map(m => {
                    const extRisk = m.externalPercent > 60 ? '#ef4444' : m.externalPercent > 45 ? '#f59e0b' : '#10b981';
                    return (
                      <div key={m.cluster} onClick={() => setSelectedCluster(m.cluster)} style={{ background: 'white', borderRadius: '10px', padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', cursor: 'pointer', borderLeft: `3px solid ${extRisk}`, transition: 'box-shadow 0.2s' }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)')}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.05)')}>
                        <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '6px' }}>{m.cluster}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--hcl-neutral-400)' }}>
                          <span>Int: <strong style={{ color: '#6b3fa0' }}>{Math.round(m.internalPercent)}%</strong></span>
                          <span>Ext: <strong style={{ color: extRisk }}>{Math.round(m.externalPercent)}%</strong></span>
                          <span>Gap: <strong>{m.avgLeadTimeExternal - m.avgLeadTimeInternal}d</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 2 — SKILL ANALYSIS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'skills' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Answer: Where do React/Node/Angular belong? */}
          <Card style={{ border: '1px solid rgba(107,63,160,0.3)', background: 'linear-gradient(135deg, rgba(107,63,160,0.04), rgba(56,189,248,0.03))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--hcl-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><HelpCircle size={16} color="white" /></div>
              <div><h3 style={{ margin: 0, fontSize: '15px' }}>Skill Clustering Q&A: Where do React, Node, and Angular belong?</h3><p style={{ margin: 0, fontSize: '12px', color: 'var(--hcl-neutral-400)' }}>Answer: They map to the same cluster — one unified group, not multiple.</p></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
              {[
                { skill: 'React', cluster: 'Programming & Full-Stack Dev', why: 'React is a JavaScript UI library — part of the full-stack JS ecosystem alongside Node and Angular.', color: '#61dafb' },
                { skill: 'Node', cluster: 'Programming & Full-Stack Dev', why: 'Node.js is the server-side JavaScript runtime — a backend counterpart to React/Angular frontends.', color: '#68a063' },
                { skill: 'Angular', cluster: 'Programming & Full-Stack Dev', why: 'Angular is a TypeScript-based frontend framework from Google, grouped with React/Node as web tech.', color: '#dd1b16' },
              ].map(s => (
                <div key={s.skill} style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderTop: `3px solid ${s.color}` }}>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: s.color, marginBottom: '6px' }}>{s.skill}</div>
                  <div style={{ ...pill('rgba(107,63,160,0.1)', '#6b3fa0'), marginBottom: '10px', display: 'block', fontSize: '10px' }}>→ {s.cluster}</div>
                  <p style={{ fontSize: '12px', color: 'var(--hcl-neutral-400)', margin: 0, lineHeight: 1.5 }}>{s.why}</p>
                </div>
              ))}
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#15803d' }}>
              <strong>✓ Design Decision:</strong> React, Node, and Angular are grouped into <strong>ONE cluster</strong> — "Programming &amp; Full-Stack Dev" — because they share the same talent pool, job market, and recruitment channels. Splitting them would fragment meaningful volume data.
            </div>
          </Card>

          {/* Cluster Taxonomy Tree */}
          <Card>
            <h3 style={{ marginTop: 0, marginBottom: '6px', fontSize: '15px' }}>Skill Cluster Taxonomy</h3>
            <p style={{ margin: '0 0 20px', fontSize: '12px', color: 'var(--hcl-neutral-400)' }}>Complete skill hierarchy — each cluster and its mapped skill keywords</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              {Object.entries(SEED_TAXONOMY).map(([cluster, skills]) => {
                const metric = clusterMetrics.find(m => m.cluster === cluster);
                const health = healthScores.find(h => h.cluster === cluster);
                const bandColor = health?.health.band === 'Healthy' ? '#10b981' : health?.health.band === 'Watch' ? '#f59e0b' : health ? '#ef4444' : '#94a3b8';
                return (
                  <div key={cluster} style={{ background: 'var(--hcl-neutral-50)', borderRadius: '10px', padding: '14px', border: `1px solid var(--hcl-neutral-200)`, borderLeft: `3px solid ${bandColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--hcl-ink)', lineHeight: 1.3 }}>{cluster}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
                        {metric && <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--hcl-neutral-400)' }}>{metric.totalCount} records</span>}
                        {health && <span style={{ ...pill(health.health.band === 'Healthy' ? '#dcfce7' : health.health.band === 'Watch' ? '#fef9c3' : '#fee2e2', bandColor), fontSize: '10px' }}>{health.health.band}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {skills.map(sk => (
                        <span key={sk} style={{ background: 'white', border: '1px solid var(--hcl-neutral-200)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: 'var(--hcl-ink)', fontWeight: 500 }}>{sk}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Coverage Gauge + Bubble chart */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <Card>
              <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>Cluster Volume Distribution</h3>
              <div style={{ height: `${clusterMetrics.length * 36 + 60}px`, minHeight: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...clusterMetrics].sort((a,b)=>b.totalCount-a.totalCount)} layout="vertical" margin={{ left: 0, right: 30, top: 4, bottom: 4 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="cluster" width={180} tick={{ fontSize: 10, fill: 'var(--hcl-ink)' }} />
                    <RechartsTooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                    <Bar dataKey="totalCount" name="Total Records" fill="#6b3fa0" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>Mapping Validation</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[
                    { label: 'Clusters Identified', value: clusterMetrics.length, color: '#6b3fa0' },
                    { label: 'Total Records Mapped', value: totalRecords, color: '#10b981' },
                    { label: 'Taxonomy Categories', value: Object.keys(SEED_TAXONOMY).length, color: '#38bdf8' },
                    { label: 'Avg Records/Cluster', value: Math.round(totalRecords / (clusterMetrics.length || 1)), color: '#f59e0b' },
                  ].map((k, i) => (
                    <div key={i} style={{ background: 'var(--hcl-neutral-50)', borderRadius: '10px', padding: '14px', border: '1px solid var(--hcl-neutral-200)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--hcl-neutral-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{k.label}</div>
                      <div style={{ fontSize: '28px', fontWeight: 700, color: k.color }}>{k.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: 'var(--hcl-neutral-50)', borderRadius: '10px', padding: '14px', border: '1px solid var(--hcl-neutral-200)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Mapping Logic</div>
                  <ol style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: 'var(--hcl-neutral-400)', lineHeight: 1.7 }}>
                    <li>If record has a pre-existing cluster label, normalize it to taxonomy.</li>
                    <li>If no cluster label, match raw skill name against keyword seeds.</li>
                    <li>Low-volume clusters (&lt;1% of total) are collapsed into "Other / Emerging Skills".</li>
                    <li>Unmatched records flagged as "Unmapped — Needs Review".</li>
                  </ol>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 3 — DEMAND TRENDS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'trends' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Header with methodology info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Demand Trend Analysis</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--hcl-neutral-400)', fontSize: '13px' }}>Chronological period comparison — first half vs second half of requisition dates</p>
            </div>
            <button onClick={() => setTrendingInfoOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(107,63,160,0.08)', border: '1px solid rgba(107,63,160,0.2)', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--hcl-purple)' }}>
              <Info size={14} /> What makes a skill "Trending"?
            </button>
          </div>

          {/* Growth indicator widgets */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {trendsData.slice(0,6).map(t => {
              const isUp = t.isTrending;
              const isDown = t.growthPercent !== null && t.growthPercent < -10;
              const pct = t.growthPercent !== null ? `${Math.round(t.growthPercent) > 0 ? '+' : ''}${Math.round(t.growthPercent)}%` : 'New';
              return (
                <Card key={t.cluster} style={{ borderTop: `3px solid ${isUp ? '#10b981' : isDown ? '#ef4444' : '#94a3b8'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{t.cluster}</div>
                    {isUp ? <span style={{ ...pill('#dcfce7','#15803d'), display:'flex', alignItems:'center', gap:'3px' }}><TrendingUp size={10} />Trending</span>
                      : isDown ? <span style={{ ...pill('#fee2e2','#dc2626'), display:'flex', alignItems:'center', gap:'3px' }}><TrendingDown size={10} />Declining</span>
                      : <span style={{ ...pill('#f1f5f9','#64748b') }}>Stable</span>}
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: isUp ? '#10b981' : isDown ? '#ef4444' : 'var(--hcl-ink)', marginBottom: '6px' }}>{pct}</div>
                  <div style={{ fontSize: '12px', color: 'var(--hcl-neutral-400)' }}>{t.previousVolume} → <strong>{t.currentVolume}</strong> reqs (P1→P2)</div>
                  <div style={{ marginTop: '10px', height: '4px', background: 'var(--hcl-neutral-100)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (t.currentVolume / Math.max(...trendsData.map(x=>x.currentVolume), 1)) * 100)}%`, height: '100%', background: isUp ? '#10b981' : isDown ? '#ef4444' : '#94a3b8', borderRadius: '2px', transition: 'width 0.5s' }} />
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Full trend table + chart */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <Card>
              <h3 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                <Compass size={18} color="var(--hcl-purple)" /> Demand History — All Clusters
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead><tr style={{ borderBottom: '2px solid var(--hcl-neutral-200)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 0', fontWeight: 600 }}>Skill Cluster</th>
                  <th style={{ textAlign: 'center', padding: '10px 0', fontWeight: 600 }}>P1 → P2</th>
                  <th style={{ textAlign: 'right', padding: '10px 0', fontWeight: 600 }}>Growth</th>
                </tr></thead>
                <tbody>
                  {trendsData.map(t => (
                    <tr key={t.cluster} style={{ borderBottom: '1px solid var(--hcl-neutral-100)' }}>
                      <td style={{ padding: '10px 0', fontWeight: 500 }}>{t.cluster}</td>
                      <td style={{ padding: '10px 0', textAlign: 'center', color: 'var(--hcl-neutral-400)', fontSize: '12px' }}>{t.previousVolume} → {t.currentVolume}</td>
                      <td style={{ padding: '10px 0', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: t.isTrending ? '#10b981' : t.growthPercent !== null && t.growthPercent < 0 ? '#ef4444' : 'var(--hcl-ink)' }}>
                            {t.growthPercent !== null ? `${Math.round(t.growthPercent) > 0 ? '+' : ''}${Math.round(t.growthPercent)}%` : 'New'}
                          </span>
                          {t.isTrending && <TrendingUp size={14} color="#10b981" />}
                          {!t.isTrending && t.growthPercent !== null && t.growthPercent < 0 && <TrendingDown size={14} color="#ef4444" />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card>
              <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>Period Volume Comparison</h3>
              <div style={{ height: `${trendsData.length * 36 + 60}px`, minHeight: '300px', maxHeight: '600px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendsData} layout="vertical" margin={{ left: 0, right: 24, top: 4, bottom: 4 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="cluster" width={170} tick={{ fontSize: 10, fill: 'var(--hcl-ink)' }} />
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--hcl-neutral-100)" />
                    <RechartsTooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                    <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Bar dataKey="previousVolume" name="Period 1" fill="#94a3b8" barSize={10} radius={[0,3,3,0]} />
                    <Bar dataKey="currentVolume" name="Period 2" fill="#6b3fa0" barSize={10} radius={[0,3,3,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Trending methodology popup */}
          {trendingInfoOpen && (
            <div style={{ position: 'fixed', top:0,left:0,right:0,bottom:0, backgroundColor:'rgba(20,20,43,0.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', backdropFilter:'blur(2px)' }}>
              <div style={{ background:'white', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', width:'100%', maxWidth:'560px', overflow:'hidden' }}>
                <div style={{ background:'linear-gradient(135deg,#6b3fa0,#4f2d80)', padding:'24px', color:'white' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'10px' }}><TrendingUp size={24} /><h3 style={{ margin:0, fontSize:'18px' }}>What makes a skill "Trending"?</h3></div>
                    <button onClick={() => setTrendingInfoOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'white', opacity:0.8 }}><X size={20} /></button>
                  </div>
                  <p style={{ margin:'8px 0 0', opacity:0.85, fontSize:'13px' }}>The methodology behind our trend detection algorithm</p>
                </div>
                <div style={{ padding:'24px', display:'flex', flexDirection:'column', gap:'16px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                    {[
                      { icon:'📊', title:'Criterion 1: Volume Growth', desc:'The cluster must show ≥ 10% growth in requisition volume between Period 1 (first half of dates) and Period 2 (second half).', color:'#dcfce7', border:'#86efac', text:'#15803d' },
                      { icon:'📋', title:'Criterion 2: Minimum Volume', desc:'The current period must have ≥ 1 record. This prevents statistical noise from very small samples inflating growth percentages.', color:'#dbeafe', border:'#93c5fd', text:'#1d4ed8' },
                    ].map((c,i) => (
                      <div key={i} style={{ background:c.color, border:`1px solid ${c.border}`, borderRadius:'10px', padding:'14px' }}>
                        <div style={{ fontSize:'20px', marginBottom:'6px' }}>{c.icon}</div>
                        <div style={{ fontWeight:700, fontSize:'13px', color:c.text, marginBottom:'6px' }}>{c.title}</div>
                        <p style={{ margin:0, fontSize:'12px', color:c.text, opacity:0.85, lineHeight:1.5 }}>{c.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:'#f8fafc', borderRadius:'10px', padding:'14px', border:'1px solid #e2e8f0' }}>
                    <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'8px' }}>🔀 Period Split Method</div>
                    <p style={{ margin:0, fontSize:'13px', color:'var(--hcl-neutral-400)', lineHeight:1.6 }}>Requisition dates are sorted chronologically. The median date becomes the split point — records before it form Period 1, records on or after form Period 2. This adapts automatically to any date range in your dataset.</p>
                  </div>
                  <div style={{ background:'#fef9c3', borderRadius:'10px', padding:'14px', border:'1px solid #fde047' }}>
                    <div style={{ fontWeight:700, fontSize:'13px', marginBottom:'6px', color:'#92400e' }}>⚠️ Interpretation Note</div>
                    <p style={{ margin:0, fontSize:'12px', color:'#92400e', lineHeight:1.5 }}>A "Trending" flag means <strong>accelerating demand</strong> — not necessarily a problem. Pre-build sourcing pipelines for trending clusters 30-45 days before formal resource requests are raised.</p>
                  </div>
                  <div style={{ display:'flex', justifyContent:'flex-end' }}>
                    <Button onClick={() => setTrendingInfoOpen(false)}>Got it</Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 4 — BOTTLENECK ENGINE
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'bottlenecks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px' }}>Bottleneck Detection Engine</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--hcl-neutral-400)', fontSize: '13px' }}>Automatically identifies fulfillment issues and classifies root causes by type</p>
          </div>

          {/* Risk Category Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {[
              { sev: 'Critical', color: '#ef4444', bg: '#fef2f2', border: '#fca5a5', icon: '🔴', desc: 'Health score < 50. Immediate action required.' },
              { sev: 'High',     color: '#f97316', bg: '#fff7ed', border: '#fdba74', icon: '🟠', desc: 'Health score 50–64. Monitor closely.' },
              { sev: 'Medium',   color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', icon: '🟡', desc: 'Health score 65–74. Proactive steps advised.' },
            ].map(c => {
              const count = bottlenecks.filter(b => b.severity === c.sev).length;
              const names = bottlenecks.filter(b => b.severity === c.sev).map(b => b.cluster);
              return (
                <div key={c.sev} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px' }}>{c.icon}</span>
                    <span style={{ fontSize: '32px', fontWeight: 800, color: c.color }}>{count}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: c.color, marginBottom: '4px' }}>{c.sev} Risk</div>
                  <div style={{ fontSize: '12px', color: c.color, opacity: 0.8, marginBottom: '10px' }}>{c.desc}</div>
                  {names.length > 0 && <div style={{ fontSize: '11px', color: c.color }}>{names.join(' · ')}</div>}
                  {names.length === 0 && <div style={{ fontSize: '11px', color: c.color, opacity: 0.6 }}>No clusters in this tier ✓</div>}
                </div>
              );
            })}
          </div>

          {/* Root Cause Breakdown + Detailed Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <Card>
                <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>Root Cause Breakdown</h3>
                {rootCausePieData.length > 0 ? (
                  <>
                    <div style={{ height: '200px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={rootCausePieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${value}`}>
                            {rootCausePieData.map((_, i) => <Cell key={i} fill={['#ef4444','#f59e0b','#38bdf8'][i % 3]} />)}
                          </Pie>
                          <RechartsTooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                          <Legend iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                      {[
                        { type: 'Skill Shortage', def: 'Both internal bench AND external market lack candidates.', color: '#ef4444' },
                        { type: 'Approval Delay', def: 'Bench exists but internal transfer approvals are slow.', color: '#f59e0b' },
                        { type: 'Hiring Delay', def: 'External pipeline bottleneck — sourcing or screening lag.', color: '#38bdf8' },
                      ].map(r => (
                        <div key={r.type} style={{ padding: '10px', background: 'var(--hcl-neutral-50)', borderRadius: '8px', borderLeft: `3px solid ${r.color}` }}>
                          <div style={{ fontWeight: 700, fontSize: '12px', color: r.color, marginBottom: '2px' }}>{r.type}</div>
                          <div style={{ fontSize: '11px', color: 'var(--hcl-neutral-400)' }}>{r.def}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '24px', textAlign: 'center', background: '#f0fdf4', borderRadius: '10px', color: '#15803d', fontWeight: 500 }}>✓ No bottlenecks detected</div>
                )}
              </Card>

              <Card>
                <h3 style={{ marginTop: 0, marginBottom: '14px', fontSize: '15px' }}>Risk Rules Library</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    { rule: 'Health Score < 50', trigger: 'Auto', sev: 'Critical', label: 'error' },
                    { rule: 'Health Score 50–64', trigger: 'Auto', sev: 'High', label: 'error' },
                    { rule: 'Health Score 65–74', trigger: 'Auto', sev: 'Medium', label: 'warning' },
                    { rule: 'Int Lead > Ext Lead', trigger: 'Root Cause', sev: 'Approval Delay', label: 'warning' },
                    { rule: 'Score < 50', trigger: 'Root Cause', sev: 'Skill Shortage', label: 'error' },
                    { rule: 'Ext Lead > Int Lead', trigger: 'Root Cause', sev: 'Hiring Delay', label: 'default' },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--hcl-neutral-50)', borderRadius: '8px', fontSize: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: '2px' }}>{r.rule}</div>
                        <div style={{ color: 'var(--hcl-neutral-400)', fontSize: '11px' }}>Trigger: {r.trigger}</div>
                      </div>
                      <Badge variant={r.label as any}>{r.sev}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card>
              <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '15px' }}>Detected Bottlenecks</h3>
              {bottlenecks.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', background: '#f0fdf4', borderRadius: '12px', color: '#15803d' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>No bottlenecks detected!</div>
                  <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '4px' }}>All skill clusters are within healthy thresholds.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {bottlenecks.map(b => (
                    <div key={b.cluster} style={{ border: `1px solid ${b.severity === 'Critical' ? '#fca5a5' : b.severity === 'High' ? '#fdba74' : '#fcd34d'}`, borderRadius: '12px', padding: '18px', background: b.severity === 'Critical' ? '#fef2f2' : b.severity === 'High' ? '#fff7ed' : '#fffbeb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>{b.cluster}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <span style={{ ...pill(b.rootCauseType === 'Skill Shortage' ? '#fee2e2' : b.rootCauseType === 'Approval Delay' ? '#fef9c3' : '#dbeafe', b.rootCauseType === 'Skill Shortage' ? '#dc2626' : b.rootCauseType === 'Approval Delay' ? '#b45309' : '#1d4ed8'), fontSize: '10px' }}>{b.rootCauseType}</span>
                          <Badge variant={b.severity === 'Critical' ? 'error' : b.severity === 'High' ? 'error' : 'warning'}>{b.severity}</Badge>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                        <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '10px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--hcl-neutral-400)', fontWeight: 600, marginBottom: '2px' }}>AVG LEAD TIME</div>
                          <div style={{ fontSize: '20px', fontWeight: 700 }}>{b.avgLeadTime}d</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '10px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--hcl-neutral-400)', fontWeight: 600, marginBottom: '2px' }}>OPEN REQS</div>
                          <div style={{ fontSize: '20px', fontWeight: 700 }}>{b.openReqs}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', background: 'rgba(255,255,255,0.8)', padding: '10px 12px', borderRadius: '8px', lineHeight: 1.5 }}>
                        <strong>Root Cause:</strong> {b.rootCause}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 5 — RECOMMENDATIONS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'recs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px' }}>AI-Driven Recommendation Engine</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--hcl-neutral-400)', fontSize: '13px' }}>Actionable strategies dynamically generated from data anomalies and lead time analysis</p>
          </div>

          {/* Priority matrix */}
          <Card>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>Recommendation Priority Matrix</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', background: 'var(--hcl-neutral-200)', borderRadius: '10px', overflow: 'hidden' }}>
              {[
                { priority: 1, label: '🔴 Priority 1', sub: 'Act Immediately', bg: '#fef2f2' },
                { priority: 2, label: '🟡 Priority 2', sub: 'Act This Month', bg: '#fffbeb' },
                { priority: 3, label: '🟢 Priority 3', sub: 'Plan & Schedule', bg: '#f0fdf4' },
              ].map(col => (
                <div key={col.priority} style={{ background: col.bg, padding: '16px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>{col.label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--hcl-neutral-400)', marginBottom: '16px' }}>{col.sub}</div>
                  {recommendations.filter(r => r.priority === col.priority).map(r => (
                    <div key={r.id} style={{ background: 'white', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '4px' }}>{r.title}</div>
                      <span style={{ ...pill('var(--hcl-neutral-100)', 'var(--hcl-neutral-400)'), fontSize: '10px' }}>{r.category}</span>
                    </div>
                  ))}
                  {recommendations.filter(r => r.priority === col.priority).length === 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--hcl-neutral-400)', textAlign: 'center', padding: '12px' }}>—</div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Full recommendation cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {recommendations.map((rec, idx) => (
              <Card key={rec.id} style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: `4px solid ${rec.priority === 1 ? '#ef4444' : rec.priority === 2 ? '#f59e0b' : '#10b981'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Badge variant="default">{rec.category}</Badge>
                    <span style={{ ...pill(rec.priority === 1 ? '#fee2e2' : rec.priority === 2 ? '#fef9c3' : '#dcfce7', rec.priority === 1 ? '#dc2626' : rec.priority === 2 ? '#b45309' : '#15803d'), fontSize: '10px' }}>Priority {rec.priority}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--hcl-neutral-300)', fontSize: '18px' }}>#{idx + 1}</span>
                </div>
                <h3 style={{ margin: 0, fontSize: '16px' }}>{rec.title}</h3>
                <p style={{ color: 'var(--hcl-neutral-400)', fontSize: '13px', lineHeight: 1.5, margin: 0, flexGrow: 1 }}>{rec.description}</p>
                <div style={{ padding: '10px 14px', backgroundColor: 'rgba(107,63,160,0.07)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={14} color="var(--hcl-purple)" />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--hcl-purple)' }}>Impact: {rec.impact}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 6 — INVESTIGATION
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'investigate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

          {/* Navigation flow breadcrumb */}
          <Card style={{ background: 'linear-gradient(135deg,rgba(107,63,160,0.05),rgba(56,189,248,0.03))', border: '1px solid rgba(107,63,160,0.15)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px' }}>Investigation Navigation Flow</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {['Upload File', 'Validate Data', 'Executive Dashboard', 'Identify Risk', 'Investigate → Skill / Location / Rec', 'Take Action'].map((step, i, arr) => (
                <React.Fragment key={step}>
                  <div style={{ background: 'white', border: '1px solid var(--hcl-neutral-200)', borderRadius: '8px', padding: '8px 14px', fontSize: '12px', fontWeight: 600, color: i === 4 ? 'var(--hcl-purple)' : 'var(--hcl-ink)', borderColor: i === 4 ? 'var(--hcl-purple)' : 'var(--hcl-neutral-200)', boxShadow: i === 4 ? '0 0 0 2px rgba(107,63,160,0.15)' : 'none' }}>{step}</div>
                  {i < arr.length - 1 && <ChevronRight size={14} color="var(--hcl-neutral-300)" />}
                </React.Fragment>
              ))}
            </div>
          </Card>

          {/* Mode switcher */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {([['skill','Skill Drilldown','🧩'],['location','Location Drilldown','📍'],['rec','Recommendation Flow','💡']] as [typeof invMode, string, string][]).map(([mode, label, icon]) => (
              <button key={mode} onClick={() => setInvMode(mode)} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px', background: invMode === mode ? 'var(--hcl-purple)' : 'var(--hcl-neutral-100)', color: invMode === mode ? 'white' : 'var(--hcl-neutral-400)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px' }}>{icon} {label}</button>
            ))}
          </div>

          {/* Skill Drilldown */}
          {invMode === 'skill' && (
            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
              <Card style={{ padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: 'var(--hcl-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Select Cluster</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {healthScores.map(({ cluster, health }) => (
                    <button key={cluster} onClick={() => setInvestigateTarget({ type: 'skill', key: cluster })} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '12px', background: investigateTarget?.key === cluster ? 'rgba(107,63,160,0.1)' : 'transparent', color: investigateTarget?.key === cluster ? 'var(--hcl-purple)' : 'var(--hcl-ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (investigateTarget?.key !== cluster) (e.currentTarget as HTMLButtonElement).style.background = 'var(--hcl-neutral-50)'; }}
                      onMouseLeave={e => { if (investigateTarget?.key !== cluster) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                      {cluster}
                      <Badge variant={health.band === 'Healthy' ? 'success' : health.band === 'Watch' ? 'warning' : 'error'}>{health.score}</Badge>
                    </button>
                  ))}
                </div>
              </Card>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {investigateTarget?.type === 'skill' ? (() => {
                  const m = clusterMetrics.find(x => x.cluster === investigateTarget.key);
                  const h = healthScores.find(x => x.cluster === investigateTarget.key);
                  const locData = getDrilldownLocationData(investigateTarget.key);
                  const trend = trendsData.find(t => t.cluster === investigateTarget.key);
                  const botl = bottlenecks.find(b => b.cluster === investigateTarget.key);
                  if (!m || !h) return null;
                  return <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      {[{ label:'Total Records', v: m.totalCount, color:'var(--hcl-ink)' }, { label:'Internal %', v: `${Math.round(m.internalPercent)}%`, color:'#6b3fa0' }, { label:'External %', v: `${Math.round(m.externalPercent)}%`, color:'#38bdf8' }, { label:'Health Score', v: h.health.score, color: h.health.band === 'Healthy' ? '#10b981' : h.health.band === 'Watch' ? '#f59e0b' : '#ef4444' }].map((k, i) => (
                        <div key={i} style={{ background: 'white', border: '1px solid var(--hcl-neutral-200)', borderRadius: '10px', padding: '14px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--hcl-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{k.label}</div>
                          <div style={{ fontSize: '24px', fontWeight: 700, color: k.color }}>{k.v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <Card>
                        <h4 style={{ margin: '0 0 14px', fontSize: '14px' }}>Lead Time by Location</h4>
                        {locData.length > 0 ? (
                          <div style={{ height: `${locData.length * 36 + 50}px`, minHeight: '150px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={locData} layout="vertical" margin={{ left:0, right:20, top:4, bottom:4 }}>
                                <XAxis type="number" tick={{ fontSize: 10 }} />
                                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                                <RechartsTooltip formatter={(v: any) => [`${v} days`, 'Avg Lead Time']} contentStyle={{ fontSize: '12px' }} />
                                <Bar dataKey="time" name="Avg Lead (days)" fill="#6b3fa0" radius={[0,4,4,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : <div style={{ color: 'var(--hcl-neutral-400)', fontSize: '13px', textAlign: 'center', padding: '24px' }}>No location data available</div>}
                      </Card>
                      <Card>
                        <h4 style={{ margin: '0 0 14px', fontSize: '14px' }}>Cluster Intelligence</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {trend && <div style={{ padding: '10px', background: trend.isTrending ? '#dcfce7' : '#f8fafc', borderRadius: '8px', fontSize: '12px' }}><strong>Demand Trend:</strong> {trend.isTrending ? `↑ Trending (+${Math.round(trend.growthPercent ?? 0)}%)` : trend.growthPercent !== null && trend.growthPercent < 0 ? `↓ Declining (${Math.round(trend.growthPercent)}%)` : 'Stable'}</div>}
                          {botl ? <div style={{ padding: '10px', background: '#fef2f2', borderRadius: '8px', fontSize: '12px', borderLeft: '3px solid #ef4444' }}><strong>Bottleneck:</strong> {botl.severity} — {botl.rootCauseType}</div> : <div style={{ padding: '10px', background: '#f0fdf4', borderRadius: '8px', fontSize: '12px' }}>✓ No bottleneck detected</div>}
                          <div style={{ padding: '10px', background: 'var(--hcl-neutral-50)', borderRadius: '8px', fontSize: '12px' }}>Int Lead: <strong>{m.avgLeadTimeInternal}d</strong> · Ext Lead: <strong>{m.avgLeadTimeExternal}d</strong> · Gap: <strong>{m.avgLeadTimeExternal - m.avgLeadTimeInternal}d</strong></div>
                        </div>
                      </Card>
                    </div>
                  </>;
                })() : (
                  <Card>
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--hcl-neutral-400)' }}>
                      <Search size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
                      <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>Select a cluster from the list</div>
                      <div style={{ fontSize: '13px' }}>Click any cluster on the left to see its full profile</div>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Location Drilldown */}
          {invMode === 'location' && (
            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '24px', alignItems: 'start' }}>
              <Card style={{ padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: 'var(--hcl-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Select Location</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {Object.entries(locationMetrics).sort((a,b)=>b[1]-a[1]).map(([loc, time]) => {
                    const color = time > 60 ? '#ef4444' : time > 40 ? '#f59e0b' : '#10b981';
                    return (
                      <button key={loc} onClick={() => setInvestigateTarget({ type: 'location', key: loc })} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: '12px', background: investigateTarget?.key === loc ? 'rgba(107,63,160,0.1)' : 'transparent', color: investigateTarget?.key === loc ? 'var(--hcl-purple)' : 'var(--hcl-ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={12} color={color} />{loc}</div>
                        <span style={{ fontWeight: 700, color, fontSize: '11px' }}>{time}d</span>
                      </button>
                    );
                  })}
                </div>
              </Card>

              <div>
                {investigateTarget?.type === 'location' ? (() => {
                  const locTime = locationMetrics[investigateTarget.key];
                  const locRecords = mappedRecords.filter(r => r.location?.trim() === investigateTarget.key);
                  const clusterDist: Record<string, number> = {};
                  locRecords.forEach(r => { clusterDist[r.skillCluster] = (clusterDist[r.skillCluster] || 0) + 1; });
                  const pieData2 = Object.entries(clusterDist).map(([name, value]) => ({ name, value })).sort((a,b)=>b.value-a.value).slice(0,6);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        {[{ label:'Avg Lead Time', v:`${locTime}d`, color: locTime > 60 ? '#ef4444' : locTime > 40 ? '#f59e0b' : '#10b981' }, { label:'Total Records', v: locRecords.length, color:'var(--hcl-ink)' }, { label:'Skill Clusters', v: Object.keys(clusterDist).length, color:'#6b3fa0' }].map((k,i) => (
                          <div key={i} style={{ background:'white', border:'1px solid var(--hcl-neutral-200)', borderRadius:'10px', padding:'14px' }}>
                            <div style={{ fontSize:'11px', fontWeight:600, color:'var(--hcl-neutral-400)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'6px' }}>{k.label}</div>
                            <div style={{ fontSize:'28px', fontWeight:700, color:k.color }}>{k.v}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <Card>
                          <h4 style={{ margin:'0 0 14px', fontSize:'14px' }}>Skill Mix at {investigateTarget.key}</h4>
                          <div style={{ height: '220px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={pieData2} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => percent ? `${(percent*100).toFixed(0)}%` : ''}>
                                  {pieData2.map((_,i) => <Cell key={i} fill={['#6b3fa0','#38bdf8','#10b981','#f59e0b','#ef4444','#8b5cf6'][i%6]} />)}
                                </Pie>
                                <RechartsTooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                                <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </Card>
                        <Card>
                          <h4 style={{ margin:'0 0 14px', fontSize:'14px' }}>Cluster Breakdown</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {Object.entries(clusterDist).sort((a,b)=>b[1]-a[1]).map(([c,n]) => (
                              <div key={c} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'12px' }}>
                                <span style={{ fontWeight:500 }}>{c}</span>
                                <span style={{ fontWeight:700, color:'var(--hcl-purple)' }}>{n}</span>
                              </div>
                            ))}
                          </div>
                        </Card>
                      </div>
                    </div>
                  );
                })() : (
                  <Card>
                    <div style={{ padding:'40px', textAlign:'center', color:'var(--hcl-neutral-400)' }}>
                      <MapPin size={32} style={{ marginBottom:'12px', opacity:0.4 }} />
                      <div style={{ fontWeight:600, fontSize:'15px', marginBottom:'4px' }}>Select a location from the list</div>
                      <div style={{ fontSize:'13px' }}>Ranked by average lead time (highest first)</div>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Recommendation Flow */}
          {invMode === 'rec' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {bottlenecks.slice(0,3).map(b => {
                  const related = recommendations.filter(r => r.category.toLowerCase().includes(b.rootCauseType === 'Skill Shortage' ? 'upskill' : b.rootCauseType === 'Approval Delay' ? 'process' : 'external') || r.id.includes(b.cluster.toLowerCase().split(' ')[0]));
                  return (
                    <div key={b.cluster} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '14px' }}>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#dc2626', marginBottom: '4px' }}>⚠️ {b.cluster}</div>
                        <div style={{ fontSize: '11px', color: '#dc2626', opacity: 0.8 }}>{b.rootCauseType} · {b.severity}</div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center' }}><ChevronRight size={20} color="var(--hcl-neutral-300)" style={{ transform: 'rotate(90deg)' }} /></div>
                      {(related.length > 0 ? related : recommendations).slice(0,2).map(r => (
                        <div key={r.id} style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '14px' }}>
                          <div style={{ fontWeight: 700, fontSize: '12px', color: '#15803d', marginBottom: '4px' }}>💡 {r.title}</div>
                          <div style={{ fontSize: '11px', color: '#15803d', opacity: 0.8 }}>{r.impact}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              {bottlenecks.length === 0 && (
                <Card>
                  <div style={{ padding:'40px', textAlign:'center', color:'#10b981' }}>
                    <div style={{ fontSize:'32px', marginBottom:'8px' }}>✓</div>
                    <div style={{ fontWeight:600, fontSize:'15px' }}>No active bottlenecks to resolve</div>
                    <div style={{ fontSize:'13px', opacity:0.8, marginTop:'4px' }}>Check back after uploading a dataset with at-risk clusters</div>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 7 — AI AGENT
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'agent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px' }}>AI Fulfillment Agent</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--hcl-neutral-400)', fontSize: '13px' }}>Generate structured reports or ask questions about your dataset</p>
          </div>

          {/* Report format buttons */}
          <Card style={{ padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--hcl-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>Generate Report</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { label: '📋 Executive Summary', key: 'executive', color: '#6b3fa0', bg: 'rgba(107,63,160,0.08)' },
                { label: '📈 Trend Explanation', key: 'trend',     color: '#0891b2', bg: 'rgba(8,145,178,0.08)' },
                { label: '⚠️ Risk Report',        key: 'risk',      color: '#dc2626', bg: 'rgba(220,38,38,0.07)' },
                { label: '💡 Recommendations',    key: 'recs',      color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
                { label: '📄 Full Analysis',      key: 'full',      color: '#15803d', bg: 'rgba(21,128,61,0.07)' },
              ].map(r => (
                <button key={r.key} onClick={() => handleChatSubmit(`Generate ${r.key} report`)} style={{ padding: '10px 16px', borderRadius: '10px', border: `1px solid ${r.color}33`, background: r.bg, color: r.color, fontWeight: 600, fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 12px ${r.color}33`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}>
                  {r.label}
                </button>
              ))}
            </div>
          </Card>

          {/* Chat interface */}
          <Card style={{ display: 'flex', flexDirection: 'column', height: '520px', padding: 0, overflow: 'hidden' }}>
            <div style={{ backgroundColor: 'var(--hcl-ink)', color: 'white', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--hcl-purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px' }}>AI</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>HCL Fulfillment Assistant</div>
                <div style={{ fontSize: '12px', opacity: 0.7 }}>{import.meta.env.VITE_GEMINI_API_KEY ? '● Gemini Live' : '● Local Analysis Mode'}</div>
              </div>
            </div>

            <div style={{ flexGrow: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', backgroundColor: 'var(--hcl-neutral-50)' }}>
              {chatMessages.map((msg, i) => {
                const isAssistant = msg.sender === 'assistant';
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isAssistant ? 'flex-start' : 'flex-end' }}>
                    <div style={{ maxWidth: '85%', padding: '12px 16px', borderRadius: '12px', borderTopLeftRadius: isAssistant ? 0 : '12px', borderTopRightRadius: !isAssistant ? 0 : '12px', backgroundColor: isAssistant ? 'white' : 'var(--hcl-purple)', color: isAssistant ? 'var(--hcl-ink)' : 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: '13px', lineHeight: 1.6, border: isAssistant ? '1px solid var(--hcl-neutral-200)' : 'none', whiteSpace: 'pre-line', fontFamily: msg.isTyping ? 'inherit' : 'inherit' }}>
                      {msg.isTyping ? <span style={{ opacity: 0.6 }}>●●●</span> : msg.text}
                    </div>
                  </div>
                );
              })}
              <div ref={chatBottomRef} />
            </div>

            <div style={{ display: 'flex', gap: '8px', padding: '10px 20px', borderTop: '1px solid var(--hcl-neutral-200)', flexWrap: 'wrap', backgroundColor: 'white' }}>
              {['Show executive summary', 'Which skills are at risk?', 'Explain trending skills', 'List recommendations'].map(s => (
                <button key={s} onClick={() => handleChatSubmit(s)} style={{ padding: '5px 12px', border: '1px solid var(--hcl-neutral-200)', borderRadius: '16px', fontSize: '11px', color: 'var(--hcl-neutral-400)', backgroundColor: 'white', cursor: 'pointer', fontWeight: 500 }}>{s}</button>
              ))}
            </div>

            <form onSubmit={e => { e.preventDefault(); handleChatSubmit(chatInput); }} style={{ display: 'flex', borderTop: '1px solid var(--hcl-neutral-200)', backgroundColor: 'white' }}>
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask anything or type 'Generate risk report'..." style={{ flexGrow: 1, padding: '14px 20px', border: 'none', outline: 'none', fontSize: '14px' }} />
              <button type="submit" style={{ padding: '0 20px', backgroundColor: 'transparent', border: 'none', color: 'var(--hcl-purple)', cursor: 'pointer' }}><Send size={20} /></button>
            </form>
          </Card>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          DRILLDOWN MODAL (global)
      ════════════════════════════════════════════════════════════════════════ */}
      {selectedCluster && (
        <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(20,20,43,0.6)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', backdropFilter:'blur(2px)' }}>
          <div style={{ backgroundColor:'white', borderRadius:'16px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', width:'100%', maxWidth:'680px', maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px', borderBottom:'1px solid var(--hcl-neutral-200)', background:'linear-gradient(135deg,#6b3fa0,#4f2d80)', color:'white' }}>
              <div><h3 style={{ margin:0, fontSize:'18px' }}>🔍 {selectedCluster}</h3><span style={{ fontSize:'12px', opacity:0.8 }}>Detailed Skill Cluster Analysis</span></div>
              <button onClick={() => setSelectedCluster(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'white', opacity:0.8 }}><X size={20} /></button>
            </div>

            <div style={{ padding:'24px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'20px' }}>
              {(() => {
                const target = healthScores.find(h => h.cluster === selectedCluster);
                if (!target) return null;
                return (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'12px' }}>
                    {[{ label:'Health Score', v:target.health.score, color:'var(--hcl-purple)' }, { label:'Internal Score', v:`${target.health.internalComponent}%`, color:'#6b3fa0' }, { label:'Lead Time Score', v:`${target.health.leadTimeComponent}%`, color:'#38bdf8' }, { label:'Status', v:target.health.band, color: target.health.band === 'Healthy' ? '#10b981' : target.health.band === 'Watch' ? '#f59e0b' : '#ef4444' }].map((k,i) => (
                      <div key={i} style={{ background:'var(--hcl-neutral-50)', borderRadius:'10px', padding:'12px', textAlign:'center' }}>
                        <div style={{ fontSize:'11px', color:'var(--hcl-neutral-400)', fontWeight:600, textTransform:'uppercase', marginBottom:'4px' }}>{k.label}</div>
                        <div style={{ fontSize:'20px', fontWeight:700, color:k.color }}>{k.v}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div>
                <h4 style={{ margin:'0 0 12px', fontSize:'14px', fontWeight:600 }}>Lead Time by Sourcing Location</h4>
                {getDrilldownLocationData(selectedCluster).length > 0 ? (
                  <div style={{ height: `${Math.min(6,getDrilldownLocationData(selectedCluster).length) * 36 + 50}px`, minHeight: '100px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getDrilldownLocationData(selectedCluster)} layout="vertical" margin={{ left:0, right:20, top:4, bottom:4 }}>
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                        <RechartsTooltip formatter={(v:any) => [`${v} days`, 'Avg Lead Time']} contentStyle={{ fontSize:'12px', borderRadius:'8px' }} />
                        <Bar dataKey="time" fill="#6b3fa0" radius={[0,4,4,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div style={{ color:'var(--hcl-neutral-400)', fontSize:'13px', textAlign:'center', padding:'20px' }}>No location data available for this cluster.</div>}
              </div>

              {(() => {
                const b = bottlenecks.find(x => x.cluster === selectedCluster);
                return (
                  <div style={{ borderTop:'1px solid var(--hcl-neutral-200)', paddingTop:'16px' }}>
                    <h4 style={{ margin:'0 0 10px', fontSize:'14px', fontWeight:600 }}>Sourcing Intelligence</h4>
                    {b ? (
                      <div style={{ background:'#fef2f2', borderRadius:'10px', padding:'14px', borderLeft:'3px solid #ef4444' }}>
                        <div style={{ fontWeight:700, fontSize:'13px', color:'#dc2626', marginBottom:'4px' }}>⚠️ {b.rootCauseType} Detected</div>
                        <p style={{ margin:0, fontSize:'12px', color:'#dc2626', lineHeight:1.5 }}>{b.rootCause}</p>
                      </div>
                    ) : <div style={{ background:'#f0fdf4', borderRadius:'10px', padding:'14px', fontSize:'13px', color:'#15803d' }}>✓ Fulfillment metrics for this cluster are healthy. Continue current strategies.</div>}
                  </div>
                );
              })()}
            </div>

            <div style={{ padding:'16px 24px', backgroundColor:'var(--hcl-neutral-50)', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--hcl-neutral-200)' }}>
              <button onClick={() => { setInvestigateTarget({ type: 'skill', key: selectedCluster }); setInvMode('skill'); setActiveTab('investigate'); setSelectedCluster(null); }} style={{ background:'none', border:'1px solid var(--hcl-neutral-200)', borderRadius:'8px', padding:'8px 14px', cursor:'pointer', fontSize:'12px', fontWeight:600, color:'var(--hcl-neutral-400)', display:'flex', alignItems:'center', gap:'6px' }}>
                <Search size={12} /> Full Investigation
              </button>
              <Button onClick={() => setSelectedCluster(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
