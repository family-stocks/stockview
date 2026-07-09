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
  { key: 'sma50',  label: 'SMA 50',  color: '#28d6bd' },
  { key: 'sma200', label: 'SMA 200', color: '#f6b53f' },
  { key: 'ema10',  label: 'EMA 10',  color: '#f4f1e8' },
  { key: 'boll',   label: 'Bollinger', color: 'rgba(40,214,189,0.5)' },
  { key: 'vwma',   label: 'VWMA',    color: '#7ddfca' },
] as const;

type IndicatorKey = typeof INDICATORS[number]['key'];

const CHART_OPTS = {
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: '#aeb7bc',
  },
  grid: {
    vertLines: { color: 'rgba(65,80,92,0.45)', style: 1 as const },
    horzLines: { color: 'rgba(65,80,92,0.45)', style: 1 as const },
  },
  crosshair: { mode: CrosshairMode.Normal },
  timeScale: { borderColor: '#41505c' },
  rightPriceScale: { borderColor: '#41505c' },
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
      upColor: '#2de1a6', downColor: '#ff6a55',
      borderVisible: false,
      wickUpColor: '#2de1a6', wickDownColor: '#ff6a55',
    });
    candles.setData(data);

    if (indicators) {
      const sma50 = chart.addSeries(LineSeries, { color: '#28d6bd', lineWidth: 1, crosshairMarkerVisible: false, visible: shown.sma50 });
      sma50.setData(indicators.sma50);
      seriesRef.current.sma50 = [sma50];

      const sma200 = chart.addSeries(LineSeries, { color: '#f6b53f', lineWidth: 1, crosshairMarkerVisible: false, visible: shown.sma200 });
      sma200.setData(indicators.sma200);
      seriesRef.current.sma200 = [sma200];

      const ema10 = chart.addSeries(LineSeries, { color: '#f4f1e8', lineWidth: 1, crosshairMarkerVisible: false, visible: shown.ema10 });
      ema10.setData(indicators.ema10);
      seriesRef.current.ema10 = [ema10];

      const bollUpper = chart.addSeries(LineSeries, { color: 'rgba(40,214,189,0.5)', lineWidth: 1, lineStyle: 2, crosshairMarkerVisible: false, visible: shown.boll });
      bollUpper.setData(indicators.boll.map(p => ({ time: p.time, value: p.upper })));
      const bollMid = chart.addSeries(LineSeries, { color: 'rgba(40,214,189,0.3)', lineWidth: 1, crosshairMarkerVisible: false, visible: shown.boll });
      bollMid.setData(indicators.boll.map(p => ({ time: p.time, value: p.mid })));
      const bollLower = chart.addSeries(LineSeries, { color: 'rgba(40,214,189,0.5)', lineWidth: 1, lineStyle: 2, crosshairMarkerVisible: false, visible: shown.boll });
      bollLower.setData(indicators.boll.map(p => ({ time: p.time, value: p.lower })));
      seriesRef.current.boll = [bollUpper, bollMid, bollLower];

      const vwma = chart.addSeries(LineSeries, { color: '#7ddfca', lineWidth: 1, crosshairMarkerVisible: false, visible: shown.vwma });
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
    backgroundColor: active ? 'rgba(255,255,255,0.07)' : 'transparent',
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
      <div ref={containerRef} style={{ width: '100%', height: 'min(56vh, 520px)', minHeight: '360px' }} />
    </div>
  );
}
