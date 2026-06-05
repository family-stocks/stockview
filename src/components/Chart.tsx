"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { AllIndicators } from "@/lib/indicators";

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartProps {
  data: CandleData[];
  indicators?: AllIndicators;
}

const INDICATORS = [
  { key: 'sma50',  label: 'SMA 50',  color: '#3b82f6' },
  { key: 'sma200', label: 'SMA 200', color: '#f59e0b' },
  { key: 'ema10',  label: 'EMA 10',  color: '#a855f7' },
  { key: 'boll',   label: 'Bollinger', color: 'rgba(59,130,246,0.5)' },
  { key: 'vwma',   label: 'VWMA',    color: '#14b8a6' },
] as const;

type IndicatorKey = typeof INDICATORS[number]['key'];

const CHART_OPTS = {
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: '#a1a6b0',
  },
  grid: {
    vertLines: { color: '#2d3139', style: 1 as const },
    horzLines: { color: '#2d3139', style: 1 as const },
  },
  crosshair: { mode: CrosshairMode.Normal },
  timeScale: { borderColor: '#3f4552' },
  rightPriceScale: { borderColor: '#3f4552' },
};

export default function Chart({ data, indicators }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const seriesRef    = useRef<Partial<Record<IndicatorKey, ISeriesApi<'Line'>[]>>>({});

  const [shown, setShown] = useState<Record<IndicatorKey, boolean>>({
    sma50:  true,
    sma200: false,
    ema10:  false,
    boll:   true,
    vwma:   false,
  });

  const toggle = (key: IndicatorKey) =>
    setShown(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    if (!containerRef.current || !data.length) return;

    seriesRef.current = {};

    const chart = createChart(containerRef.current, {
      ...CHART_OPTS,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    candles.setData(data);

    if (indicators) {
      const sma50 = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, crosshairMarkerVisible: false, visible: shown.sma50 });
      sma50.setData(indicators.sma50);
      seriesRef.current.sma50 = [sma50];

      const sma200 = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, crosshairMarkerVisible: false, visible: shown.sma200 });
      sma200.setData(indicators.sma200);
      seriesRef.current.sma200 = [sma200];

      const ema10 = chart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 1, crosshairMarkerVisible: false, visible: shown.ema10 });
      ema10.setData(indicators.ema10);
      seriesRef.current.ema10 = [ema10];

      const bollUpper = chart.addSeries(LineSeries, { color: 'rgba(59,130,246,0.5)', lineWidth: 1, lineStyle: 2, crosshairMarkerVisible: false, visible: shown.boll });
      bollUpper.setData(indicators.boll.map(p => ({ time: p.time, value: p.upper })));
      const bollMid = chart.addSeries(LineSeries, { color: 'rgba(59,130,246,0.3)', lineWidth: 1, crosshairMarkerVisible: false, visible: shown.boll });
      bollMid.setData(indicators.boll.map(p => ({ time: p.time, value: p.mid })));
      const bollLower = chart.addSeries(LineSeries, { color: 'rgba(59,130,246,0.5)', lineWidth: 1, lineStyle: 2, crosshairMarkerVisible: false, visible: shown.boll });
      bollLower.setData(indicators.boll.map(p => ({ time: p.time, value: p.lower })));
      seriesRef.current.boll = [bollUpper, bollMid, bollLower];

      const vwma = chart.addSeries(LineSeries, { color: '#14b8a6', lineWidth: 1, crosshairMarkerVisible: false, visible: shown.vwma });
      vwma.setData(indicators.vwma);
      seriesRef.current.vwma = [vwma];
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, indicators]);

  // Sync visibility without recreating the chart
  useEffect(() => {
    for (const key of Object.keys(shown) as IndicatorKey[]) {
      seriesRef.current[key]?.forEach(s => s.applyOptions({ visible: shown[key] }));
    }
  }, [shown]);

  const btnStyle = (active: boolean, color?: string): React.CSSProperties => ({
    fontSize: '0.7rem',
    padding: '0.2rem 0.55rem',
    borderRadius: '0.25rem',
    fontWeight: 500,
    cursor: 'pointer',
    border: `1px solid ${active ? (color || 'var(--accent-primary)') : 'var(--border-subtle)'}`,
    backgroundColor: active ? `${color || 'var(--accent-primary)'}22` : 'transparent',
    color: active ? (color || 'var(--accent-primary)') : 'var(--text-tertiary)',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
        {INDICATORS.map(({ key, label, color }) => (
          <button key={key} onClick={() => toggle(key)} style={btnStyle(shown[key], color)}>
            {label}
          </button>
        ))}
      </div>
      <div ref={containerRef} style={{ width: '100%', height: '520px' }} />
    </div>
  );
}
