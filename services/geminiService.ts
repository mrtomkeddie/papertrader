import { GoogleGenAI, Type } from "@google/genai";
import { AiTradeAction, Position, Strategy, Explanation, Opportunity, RankedOpportunity } from "../types";

/**
 * API key sourcing that works in both browser (Vite) and Node.
 * Prefers process.env in Node; falls back to import.meta.env when present.
 */
function resolveApiKey(): string | undefined {
  const env = typeof process !== 'undefined' && (process as any)?.env ? (process as any).env as Record<string, string | undefined> : {};
  const fromProcess = env.VITE_API_KEY || env.GEMINI_API_KEY || env.API_KEY;
  if (fromProcess) return fromProcess;
  try {
    const ve = (import.meta as any)?.env;
    return ve?.VITE_API_KEY || ve?.GEMINI_API_KEY;
  } catch {
    return undefined;
  }
}
const API_KEY = resolveApiKey();

if (!API_KEY) {
  console.warn("Gemini API key not found. Explanations will be mocked.");
}

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

const formatPrice = (price: number) => price.toFixed(4);
const formatDateTime = (isoString: string) => new Date(isoString).toUTCString();

// Deterministic explanation used when AI is unavailable or errors
const deterministicExplanation = (position: Position, strategy: Strategy): string => {
  return `Entered ${position.side} on ${position.symbol} based on a signal from TradingView at ${formatDateTime(position.entry_ts)}. Entry price: ${formatPrice(position.entry_price)}. Stop-loss was set using the ${strategy.stop_logic} method (ATR multiplier: ${strategy.atr_mult}) at ${formatPrice(position.stop_price)}. The take-profit target was set at a ${strategy.take_profit_R}R multiple, targeting a price of ${formatPrice(position.tp_price)}. The total amount at risk for this trade was £${strategy.risk_per_trade_gbp}.`;
};

// Deterministic failure analysis used when AI is unavailable or errors (for losing trades)
const deterministicFailureAnalysis = (position: Position, explanation: Explanation): string => {
  const lossGbp = position.pnl_gbp ? Math.abs(position.pnl_gbp).toFixed(2) : "unknown";
  const rText = position.R_multiple !== null ? `${Math.abs(position.R_multiple).toFixed(2)}R` : "a negative R";
  const exitText = explanation.exit_reason || "the stop level";
  const entry = formatPrice(position.entry_price);
  const stop = position.stop_price !== undefined ? formatPrice(position.stop_price) : "N/A";

  const hypothesis = explanation.exit_reason?.toLowerCase().includes("stop")
    ? "The move likely reversed near a key level or expanded in volatility, invalidating the setup before momentum could continue."
    : "Price moved against the setup shortly after entry, indicating weak signal quality or unfavorable location."

  return `The trade resulted in a loss of £${lossGbp} (−${rText}). Price moved against the position after entry at ${entry} and reached ${exitText} (${stop}). ${hypothesis} Consider waiting for stronger confirmation at a cleaner level, or adjusting stop placement to reduce early invalidation.`;
};

export const generateExplanationText = async (position: Position, strategy: Strategy, strategyReason?: string): Promise<string> => {
  if (!ai) {
    return deterministicExplanation(position, strategy);
  }
  
  const reasonPart = strategyReason ? `- Strategy Reason: ${strategyReason}` : '';

  const prompt = `
    You are a trading assistant. Given the following trade data, generate a concise, plain-English explanation following the provided template. Incorporate the strategy reason if provided.

    **Trade Data:**
    - Symbol: ${position.symbol}
    - Side: ${position.side}
    - Entry Time: ${formatDateTime(position.entry_ts)}
    - Entry Price: ${formatPrice(position.entry_price)}
    - Stop Logic: ${strategy.stop_logic}
    - ATR Multiplier: ${strategy.atr_mult}
    - Stop Price: ${formatPrice(position.stop_price)}
    - Take Profit R-Multiple: ${strategy.take_profit_R}
    - Take Profit Price: ${formatPrice(position.tp_price)}
    - Risk Amount (GBP): ${strategy.risk_per_trade_gbp}
    - Signal Source: Deterministic Strategy
    ${reasonPart}

    **Template:**
    "Entered {side} on {symbol} based on {strategy.name} strategy at {entry_time}. [Briefly incorporate strategy reason here if provided]. Entry price: {entry_price}. Stop-loss was set using the {stop_logic} method (ATR multiplier: {atr_multiplier}) at {stop_price}. The take-profit target was set at a {take_profit_R}R multiple, targeting a price of {tp_price}. The total amount at risk for this trade was £{risk_amount}."

    **Instructions:**
    1. Replace all placeholders in the template with the provided data.
    2. If strategy reason is provided, integrate it naturally into the explanation after mentioning the strategy.
    3. Keep it concise, 2-4 sentences max.
    4. Return ONLY the completed paragraph as a single string.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    return response.text;
  } catch (error: any) {
    console.error("Error generating explanation with Gemini:", error.message || String(error));
    return deterministicExplanation(position, strategy);
  }
};

export const generateFailureAnalysis = async (position: Position, explanation: Explanation): Promise<string> => {
  // If the trade isn't a loser, skip AI and deterministic output
  if (position.pnl_gbp === null || position.pnl_gbp >= 0) {
    return ""; // No failure analysis needed for non-losing trades
  }

  // If AI is unavailable, return deterministic analysis
  if (!ai) {
    return deterministicFailureAnalysis(position, explanation);
  }

  const prompt = `
    You are a senior trading analyst reviewing a losing trade. Your goal is to provide a concise, educational post-mortem on why the trade failed.

    **Trade Context:**
    - Symbol: ${position.symbol}
    - Trade Direction: ${position.side}
    - AI's Original Rationale for Entry (which included multi-timeframe analysis): "${explanation.plain_english_entry}"
    - Entry Price: ${position.entry_price.toFixed(4)}
    - Stop-Loss Price: ${position.stop_price.toFixed(4)}
    
    **Outcome:**
    The trade hit its ${explanation.exit_reason || 'stop-loss'} at ${position.stop_price.toFixed(4)}, resulting in a loss of £${Math.abs(position.pnl_gbp).toFixed(2)}.

    **Your Task:**
    Analyze the initial rationale and the outcome. Provide a brief analysis (2-3 sentences) of a likely reason for the failure. The original rationale was based on multi-timeframe analysis, so consider these advanced possibilities:
    - Was the higher-timeframe analysis incorrect or did the trend suddenly reverse?
    - Did the lower-timeframe entry signal occur at a poor location despite the broader trend being correct (e.g., entering right below major resistance)?
    - Was the failure due to a sudden news event or a spike in volatility that the technical setup couldn't account for?
    - Did the entry prove to be a "liquidity grab" or a "bull/bear trap" where price moved just enough to trigger stops before reversing?

    Provide only the analysis text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
    });
    return response.text;
  } catch (error: any) {
    console.error("Error generating failure analysis with Gemini:", error.message || String(error));
    // Always provide deterministic analysis instead of failing the UI
    return deterministicFailureAnalysis(position, explanation);
  }
};


export const getAiTradeAction = async (symbol: string, requestedTimeframe: string): Promise<AiTradeAction> => {
    if (!ai) {
        throw new Error("Gemini API key not configured.");
    }

    const prompt = `
        You are a professional trader performing a multi-timeframe analysis for ${symbol}. The user is interested in opportunities around the ${requestedTimeframe} timeframe, but you must determine the optimal execution timeframe.

        **Analysis Steps:**
        1.  **High-Timeframe Context (Daily/Weekly):** First, establish the dominant market trend and identify major support and resistance zones. This determines the overall bias (bullish, bearish, or neutral).
        2.  **Execution Timeframe Analysis (Scan 4H, 1H, 15m):** Look for a specific, high-probability trading setup (e.g., breakout, pullback, reversal pattern) on various execution timeframes that aligns with the high-timeframe context.
        3.  **Optimal Timeframe Selection:** From your analysis, decide which timeframe (e.g., "1H", "4H") presents the clearest signal and the best structure for defining entry, stop, and target levels. This is the 'suggested_timeframe'.
        4.  **Risk/Reward Assessment:** Based on the setup on the optimal timeframe, you MUST calculate the risk/reward ratio (RRR). A professional trader rarely takes a trade with an RRR below 1.5.
        5.  **Volatility & Liquidity:** Based on the asset, determine appropriate slippage and fee assumptions in basis points (bps).

        **Decision Logic:**
        -   If a setup on an optimal execution timeframe aligns with the higher timeframe trend AND the RRR is **1.5 or greater**, propose a "TRADE".
        -   If there is a conflict between timeframes, recommend "HOLD".
        -   If the technical setup is valid but the RRR is **less than 1.5**, recommend "HOLD".
        -   If the market is unclear, recommend "HOLD".

        **Allowed Strategies:**
        - Opening-Range Breakout (ORB)
        - Trend Pullback / Break-and-Retest
        - VWAP Reversion

        You MUST set trade.strategy_type to exactly one of the allowed strategies. Do not propose trades using any other method.

        **Today's date is ${new Date().toDateString()}.**
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: prompt,
            config: {
                systemInstruction: "You are a professional technical analyst. Your goal is to identify high-probability trades by performing top-down, multi-timeframe analysis. You must reject trades with an RRR below 1.5 and suggest the optimal execution timeframe. Respond only with the requested JSON object.",
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        action: { type: Type.STRING, enum: ["TRADE", "HOLD"] },
                        trade: {
                            type: Type.OBJECT,
                            properties: {
                                side: { type: Type.STRING, enum: ["LONG", "SHORT"] },
                                entry_price: { type: Type.NUMBER },
                                stop_price: { type: Type.NUMBER },
                                tp_price: { type: Type.NUMBER },
                                reason: { type: Type.STRING },
                                strategy_type: { type: Type.STRING },
                                slippage_bps: { type: Type.NUMBER },
                                fee_bps: { type: Type.NUMBER },
                                risk_reward_ratio: { type: Type.NUMBER },
                                suggested_timeframe: { type: Type.STRING, description: "The optimal timeframe for this trade (e.g., '1H', '4H', '1D')." },
                            },
                        },
                        hold_reason: { type: Type.STRING }
                    },
                    required: ["action"]
                }
            }
        });

        const jsonText = response.text;
        const action = JSON.parse(jsonText);

        // Validation
        if (action.action === "TRADE" && (!action.trade || !action.trade.suggested_timeframe)) {
            throw new Error("AI response action is TRADE but is missing trade details or suggested timeframe.");
        }
        if (action.action === "HOLD" && !action.hold_reason) {
            throw new Error("AI response action is HOLD but is missing a reason.");
        }

        return action;

    } catch (error: any) {
        console.error("Error getting AI trade action:", error.message || String(error));
        if (error.error && error.error.code === 429) {
            throw new Error(`AI quota exceeded. Please wait a moment or check your Google AI Studio plan. For details: https://ai.google.dev/gemini-api/docs/rate-limits`);
        }
        throw new Error("Failed to generate a trade action from the AI.");
    }
};

// Ranking of opportunities has been removed; all qualifying opportunities are processed without ranking.