import { useEffect, useState, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";
import "./App.css";

const firebaseConfig = {
  apiKey:            "AIzaSyCkZZmENxoRU3_vk5HLa38Crr_tVbpxeSY",
  authDomain:        "fair-pricing-b4ae6.firebaseapp.com",
  databaseURL:       "https://fair-pricing-b4ae6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "fair-pricing-b4ae6",
  storageBucket:     "fair-pricing-b4ae6.firebasestorage.app",
  messagingSenderId: "654071325670",
  appId:             "1:654071325670:web:9852ac35dce39d2590ec27",
  measurementId:     "G-Z5W64SH1TY",
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── Pricing config ────────────────────────────────
const RATE_PER_WATT = 7; // ₹ per W per hour

function calcCostPerHour(watts) {
  return watts * RATE_PER_WATT;
}
function calcCostPerMin(watts) {
  return (watts * RATE_PER_WATT) / 60;
}

// Node 1 = High (red) | Node 2 = Medium (yellow) | Node 3 = Low (green)
const NODE_META = {
  node1: { label: "Node 1", role: "High Consumption",   icon: "⚡", color: "#ff4d4d", glow: "#ff4d4d55" },
  node2: { label: "Node 2", role: "Medium Consumption", icon: "🔆", color: "#ffaa00", glow: "#ffaa0055" },
  node3: { label: "Node 3", role: "Low Consumption",    icon: "🌿", color: "#00e5a0", glow: "#00e5a055" },
};

// Display order: High → Medium → Low
const NODE_ORDER = ["node1", "node2", "node3"];

const MAX_HISTORY = 30;

function RadialGauge({ value, max = 20, color, glow }) {
  const pct           = Math.min(value / max, 1);
  const r             = 42;
  const cx            = 56;
  const cy            = 56;
  const circumference = 2 * Math.PI * r;
  const dashOffset    = circumference * (1 - pct);

  return (
    <svg width="112" height="112" viewBox="0 0 112 112">
      <defs>
        <filter id={`glow-${color.slice(1)}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1f2e" strokeWidth="10" />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{
          transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)",
          filter: `drop-shadow(0 0 6px ${glow})`,
        }}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700" fontFamily="'Share Tech Mono', monospace">
        {value.toFixed(2)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#6b7280" fontSize="9" fontFamily="'Share Tech Mono', monospace">
        WATTS
      </text>
    </svg>
  );
}

function SparkLine({ history, color }) {
  if (history.length < 2) return null;
  const w   = 200, h = 50;
  const min = Math.min(...history);
  const max = Math.max(...history) || 1;
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - ((v - min) / (max - min + 0.001)) * (h - 8) - 4;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`grad-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={`0,${h} ${pts} ${w},${h}`}
        fill={`url(#grad-${color.slice(1)})`}
        stroke="none"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  );
}

function PricingBadge({ watts, color }) {
  const perHour = calcCostPerHour(watts);
  const perMin  = calcCostPerMin(watts);

  return (
    <div className="pricing-badge" style={{ "--accent": color }}>
      <div className="pricing-row">
        <span className="pricing-key">RATE</span>
        <span className="pricing-val" style={{ color }}>₹7 / W</span>
      </div>
      <div className="pricing-row">
        <span className="pricing-key">NOW</span>
        <span className="pricing-val" style={{ color }}>₹{perHour.toFixed(2)}/hr</span>
      </div>
      <div className="pricing-row">
        <span className="pricing-key">PER MIN</span>
        <span className="pricing-val">{perMin < 0.01 ? "<₹0.01" : `₹${perMin.toFixed(3)}`}/min</span>
      </div>
      <div className="pricing-row">
        <span className="pricing-key">UNITS</span>
        <span className="pricing-val">{watts.toFixed(2)} W</span>
      </div>
    </div>
  );
}

function NodeCard({ nodeKey, value, history }) {
  const meta       = NODE_META[nodeKey];
  const prev       = history.length >= 2 ? history[history.length - 2] : value;
  const trend      = value > prev + 0.05 ? "▲" : value < prev - 0.05 ? "▼" : "—";
  const trendColor = trend === "▲" ? "#ff4d4d" : trend === "▼" ? "#00e5a0" : "#6b7280";

  return (
    <div className="node-card" style={{ "--accent": meta.color, "--glow": meta.glow }}>
      <div className="card-header">
        <span className="card-icon">{meta.icon}</span>
        <div>
          <div className="card-label">{meta.label}</div>
          <div className="card-role">{meta.role}</div>
        </div>
        <span className="trend-badge" style={{ color: trendColor }}>{trend}</span>
      </div>

      <div className="card-gauge">
        <RadialGauge value={value} color={meta.color} glow={meta.glow} />
      </div>

      <div className="card-spark">
        <SparkLine history={history} color={meta.color} />
      </div>

      <PricingBadge watts={value} color={meta.color} />

      <div className="card-footer">
        <span className="stat-label">PEAK</span>
        <span className="stat-val" style={{ color: meta.color }}>
          {Math.max(...history, 0).toFixed(2)} W
        </span>
        <span className="stat-label">AVG</span>
        <span className="stat-val">
          {history.length
            ? (history.reduce((a, b) => a + b, 0) / history.length).toFixed(2)
            : "—"} W
        </span>
      </div>
    </div>
  );
}

function BillingSummary({ power, history }) {
  const totalPerHour  = calcCostPerHour(power.total);
  const totalPerDay   = totalPerHour * 24;
  const totalPerMonth = totalPerDay * 30;

  const avgNode1 = history.node1.length
    ? history.node1.reduce((a, b) => a + b, 0) / history.node1.length : 0;
  const avgNode2 = history.node2.length
    ? history.node2.reduce((a, b) => a + b, 0) / history.node2.length : 0;
  const avgNode3 = history.node3.length
    ? history.node3.reduce((a, b) => a + b, 0) / history.node3.length : 0;

  const avgTotal   = avgNode1 + avgNode2 + avgNode3;
  const avgPerHour = calcCostPerHour(avgTotal);

  const nodes     = NODE_ORDER.map(key => ({
    key,
    label: NODE_META[key].label,
    watts: power[key],
    meta:  NODE_META[key],
  }));
  const totalCost = nodes.reduce((s, n) => s + calcCostPerHour(n.watts), 0) || 1;

  return (
    <div className="billing-panel">
      <div className="billing-header">
        <span className="billing-icon">₹</span>
        <div>
          <div className="billing-title">FAIR PRICING — BILLING SUMMARY</div>
          <div className="billing-sub">Based on ₹7 per Watt · ₹7 per Watt/hour</div>
        </div>
      </div>

      <div className="billing-live">
        <div className="billing-live-block">
          <span className="billing-live-label">LIVE COST RATE</span>
          <span className="billing-live-value">₹{totalPerHour.toFixed(2)}<sup>/hr</sup></span>
        </div>
        <div className="billing-live-block">
          <span className="billing-live-label">PROJECTED / DAY</span>
          <span className="billing-live-value accent2">₹{totalPerDay.toFixed(2)}</span>
        </div>
        <div className="billing-live-block">
          <span className="billing-live-label">PROJECTED / MONTH</span>
          <span className="billing-live-value accent3">₹{totalPerMonth.toFixed(0)}</span>
        </div>
      </div>

      <div className="billing-breakdown-label">NODE-WISE COST SHARE</div>
      <div className="billing-breakdown">
        {nodes.map(({ key, label, watts, meta }) => {
          const costHr   = calcCostPerHour(watts);
          const sharePct = (costHr / totalCost) * 100;
          return (
            <div key={key} className="billing-row">
              <span className="billing-node-icon">{meta.icon}</span>
              <span className="billing-node-label">{label}</span>
              <span className="billing-node-watts">{watts.toFixed(2)} W</span>
              <div className="billing-bar-wrap">
                <div className="billing-bar-track">
                  <div
                    className="billing-bar-fill"
                    style={{ width: `${sharePct}%`, background: meta.color }}
                  />
                </div>
                <span className="billing-bar-pct">{sharePct.toFixed(0)}%</span>
              </div>
              <span className="billing-node-cost" style={{ color: meta.color }}>
                ₹{costHr.toFixed(2)}/hr
              </span>
            </div>
          );
        })}
      </div>

      <div className="rate-card">
        <div className="rate-card-title">RATE CARD</div>
        <div className="rate-card-grid">
          <span className="rate-key">Base unit</span>
          <span className="rate-val">1 W</span>
          <span className="rate-key">Price / unit</span>
          <span className="rate-val highlight">₹ 7.00</span>
          <span className="rate-key">Price / Watt</span>
          <span className="rate-val">₹ 7.00 / hr</span>
          <span className="rate-key">Avg cost rate</span>
          <span className="rate-val">₹{avgPerHour.toFixed(2)} / hr</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [power, setPower]           = useState({ node1: 0, node2: 0, node3: 0, total: 0 });
  const [history, setHistory]       = useState({ node1: [], node2: [], node3: [] });
  const [connected, setConnected]   = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const tickRef = useRef(0);

  useEffect(() => {
    const dbRef = ref(db, "/powerData");
    const unsub = onValue(dbRef, (snap) => {
      const data = snap.val();
      if (!data) return;
      setConnected(true);
      setLastUpdate(new Date());
      setPower({
        node1: data.node1 ?? 0,
        node2: data.node2 ?? 0,
        node3: data.node3 ?? 0,
        total: data.total ?? 0,
      });
      setHistory(prev => ({
        node1: [...prev.node1.slice(-MAX_HISTORY + 1), data.node1 ?? 0],
        node2: [...prev.node2.slice(-MAX_HISTORY + 1), data.node2 ?? 0],
        node3: [...prev.node3.slice(-MAX_HISTORY + 1), data.node3 ?? 0],
      }));
      tickRef.current += 1;
    }, () => setConnected(false));
    return () => unsub();
  }, []);

  const totalPct = Math.min((power.total / 60) * 100, 100);

  return (
    <div className="app">
      <div className="bg-grid" />

      <header className="app-header">
        <div className="header-left">
          <div className="logo-mark">⚡</div>
          <div>
            <h1 className="app-title">POWER<span>GRID</span></h1>
            <p className="app-subtitle">fair-pricing · Realtime Monitor</p>
          </div>
        </div>
        <div className="header-right">
          <div className={`status-dot ${connected ? "live" : "offline"}`} />
          <span className="status-label">{connected ? "LIVE" : "OFFLINE"}</span>
          {lastUpdate && (
            <span className="last-update">{lastUpdate.toLocaleTimeString()}</span>
          )}
        </div>
      </header>

      <div className="total-banner">
        <div className="total-left">
          <span className="total-label">TOTAL SYSTEM POWER</span>
          <span className="total-value">{power.total.toFixed(2)} <sup>W</sup></span>
        </div>
        <div className="total-bar-wrap">
          <div className="total-bar-bg">
            <div className="total-bar-fill" style={{ width: `${totalPct}%` }} />
          </div>
          <span className="total-bar-pct">{totalPct.toFixed(0)}% of 60W capacity</span>
        </div>
        <div className="banner-cost-pill">
          <span className="banner-cost-label">LIVE COST</span>
          <span className="banner-cost-value">
            ₹{calcCostPerHour(power.total).toFixed(2)}<span className="banner-cost-unit">/hr</span>
          </span>
        </div>
      </div>

      {/* Cards: High (red) → Medium (yellow) → Low (green) */}
      <div className="nodes-grid">
        {NODE_ORDER.map(key => (
          <NodeCard key={key} nodeKey={key} value={power[key]} history={history[key]} />
        ))}
      </div>

      <BillingSummary power={power} history={history} />

      <footer className="app-footer">
        ESP32 · ACS712 · Firebase RTDB · Updates every 2s · Rate: ₹7 per Watt
      </footer>
    </div>
  );
}