import React, { useEffect, useRef, memo } from 'react';

interface TradingViewWidgetProps {
  symbol: string;
  timeframe?: string;
}

// Maps our strategy timeframe format to what TradingView's widget expects.
const mapTimeframeToInterval = (timeframe: string = '1D'): string => {
    const unit = timeframe.slice(-1).toUpperCase();
    const value = timeframe.slice(0, -1);

    switch(unit) {
        case 'M': return value; // Minutes
        case 'H': return String(Number(value) * 60); // Hours to minutes
        case 'D': return 'D'; // Days
        case 'W': return 'W'; // Weeks
        default: return 'D';
    }
}

const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({ symbol, timeframe }) => {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = `tradingview-widget-container-${crypto.randomUUID()}`;
  const interval = mapTimeframeToInterval(timeframe);

  useEffect(() => {
    // Prevent re-initialization on re-renders
    if (container.current && container.current.children.length === 0) {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
      script.type = "text/javascript";
      script.async = true;
      script.innerHTML = `
        {
          "autosize": true,
          "symbol": "${symbol}",
          "interval": "${interval}",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "enable_publishing": false,
          "allow_symbol_change": true,
          "container_id": "${widgetId}"
        }`;
      
      const widgetContainer = document.createElement('div');
      widgetContainer.id = widgetId;
      widgetContainer.className = "tradingview-widget-container__widget h-full";
      
      container.current.appendChild(widgetContainer);
      container.current.appendChild(script);
    }
  }, [symbol, interval, widgetId]);

  return (
    <div className="tradingview-widget-container h-full" ref={container} style={{ height: "100%", width: "100%" }}>
    </div>
  );
};

export default memo(TradingViewWidget);