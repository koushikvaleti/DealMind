import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { HindsightClient } from "npm:@vectorize-io/hindsight-client";
import { OpenAI } from "npm:openai@4.86.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Initialize Hindsight Client using environment variables
const hindsight = new HindsightClient({
  baseUrl: Deno.env.get("HINDSIGHT_API_URL") || "https://api.hindsight.vectorize.io",
  apiKey: Deno.env.get("HINDSIGHT_API_KEY"),
});

const SYSTEM_PROMPT = `You are DealMind, an AI sales intelligence assistant.

Help sales professionals understand deals, customers, risks, conversations and next actions.

Only use information available in the supplied context.
Clearly distinguish facts from interpretation.
Never invent customer statements, previous conversations, memories or deal information.
When information is unavailable, say so.
Use relevant long-term memories when answering.
Give concise, practical and actionable responses.`;

const MEMORY_PROMPT = `Extract the most important durable facts from the following sales conversation.
Only include things a salesperson would want to remember long-term:
customer preferences, decision-maker preferences, technical requirements, budget, timeline, concerns, objections, competitors, buying signals, customer commitments, important meetings, important statements, product requirements.
Do not retain trivial small talk.
Return a JSON array of short memory strings. If nothing important, return [].
Example: ["CTO prefers technical discussions before pricing","Integration timeline is the biggest concern"]`;

const MEETING_PREP_PROMPT = `You are DealMind. Generate a meeting preparation brief based ONLY on the supplied deal context.
Structure the response with these exact sections, each as a short paragraph or bullet list:
**Meeting Objective:** One clear sentence.
**Customer Priorities:** 2-3 bullet points.
**Known Concerns:** 2-3 bullet points (or "None identified" if unavailable).
**Likely Questions:** 2-3 bullet points.
**Potential Objections:** 2-3 bullet points (or "None identified" if unavailable).
**Recommended Talking Points:** 2-3 bullet points.
**Suggested Next Step:** One actionable sentence.
If information is missing for any section, say so explicitly. Never invent customer statements.`;

const RISK_ANALYSIS_PROMPT = `You are DealMind. Analyze risks for this deal based ONLY on the supplied context.
Format your response cleanly using markdown with these sections:
### Key Risks
- **[Risk Title]** ([Level: Low/Medium/High/Critical]): Explanation of why.

### Summary
A brief closing summary of the overall risk posture.

Consider: deal stage, value, customer concerns, conversation history, memories, decision maker, and deal inactivity. Be concise and professional.`;

const INSIGHTS_PROMPT = `You are DealMind. Generate deal intelligence insights based ONLY on the supplied context.
Return a JSON array of insight objects. Each object has:
- "type": one of "customer_preference", "risk", "next_action", "objection", "buying_signal", "summary"
- "title": short title
- "description": one or two sentences
Generate 3-5 insights. Base each on real data in the context. Never invent information.
Return ONLY the JSON array, no other text.`;

type Deal = {
  id: string;
  user_id: string;
  company_name: string;
  deal_value: number;
  industry: string;
  stage: string;
  decision_maker: string;
  health_score: number;
  risk_level: string;
  risk_summary: string;
  next_action: string;
  last_interaction: string | null;
};

type Conversation = { role: string; message: string; created_at: string };
type Customer = { name: string; role: string; email: string; company: string; notes: string };
type Memory = { memory_type: string; content: string };

function safeBody(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseJsonArray(text: string): unknown[] {
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1) return [];
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function callLLM(messages: { role: string; content: string }[], maxTokens = 700): Promise<string> {
  const apiKey = Deno.env.get("AI_API_KEY");

  if (!apiKey) {
    console.error("DEAL-AI CONFIG ERROR: AI_API_KEY environment variable is missing.");
    throw new Error("AI_API_KEY is not configured in Supabase Secrets.");
  }

  // Initialize the OpenAI client pointing to Groq's endpoint with the recommended model
  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  try {
    const response = await openai.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: messages as any,
      temperature: 0.4,
      max_tokens: maxTokens,
    });

    const text = response.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Groq response did not contain generated text.");
    }

    return text;
  } catch (error: any) {
    console.error("Groq API / Function Calling Error:", error?.message || error);
    throw new Error(`AI processing error: ${error?.message || "Unknown model error"}`);
  }
}

async function loadDealContext(supabase: ReturnType<typeof createClient>, dealId: string, userId: string) {
  const { data: dealRow, error: dealError } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (dealError || !dealRow) return { error: "Deal not found" as const, status: 404 };
  const deal = dealRow as Deal;
  if (deal.user_id !== userId) return { error: "Forbidden" as const, status: 403 };

  const [{ data: customerRows }, { data: conversationRows }, { data: memoryRows }, { data: activityRows }] = await Promise.all([
    supabase.from("customers").select("name,role,email,company,notes").eq("deal_id", dealId),
    supabase.from("conversations").select("role,message,created_at").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(10),
    supabase.from("memories").select("memory_type,content").eq("deal_id", dealId).order("updated_at", { ascending: false }).limit(20),
    supabase.from("deal_activities").select("activity_type,description,created_at").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(10),
  ]);

  const customers = (customerRows || []) as Customer[];
  const conversations = ((conversationRows || []) as Conversation[]).reverse();
  const memories = (memoryRows || []) as Memory[];
  const activities = (activityRows || []) as { activity_type: string; description: string; created_at: string }[];

  const context = [
    `CURRENT DEAL: ${deal.company_name} (${deal.industry}), value ${deal.deal_value}, stage ${deal.stage}, decision maker ${deal.decision_maker}, health ${deal.health_score}, risk ${deal.risk_level} — ${deal.risk_summary}, next action: ${deal.next_action}, last interaction: ${deal.last_interaction || "none"}.`,
    customers.length ? `CUSTOMER DATA: ${customers.map((c) => `${c.name} (${c.role}) —${c.notes}`).join("; ")}` : "CUSTOMER DATA: none recorded.",
    conversations.length ? `RECENT CONVERSATIONS:\n${conversations.map((c) => `${c.role}:${c.message}`).join("\n")}` : "RECENT CONVERSATIONS: none.",
    memories.length ? `RELEVANT MEMORIES:\n${memories.map((m) => `- ${m.content}`).join("\n")}` : "RELEVANT MEMORIES: none.",
    activities.length ? `RECENT ACTIVITIES:\n${activities.map((a) => `- ${a.activity_type}:${a.description}`).join("\n")}` : "RECENT ACTIVITIES: none.",
  ].join("\n\n");

  return { deal, customers, conversations, memories, activities, context };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  console.log("DEAL-AI: request received");
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    console.log("DEAL-AI: authorization checked");
    const userId = userData.user.id;

    const body = await req.json();
    console.log("DEAL-AI: request body parsed");
    const action = safeBody(body?.action, "chat");
    const dealId = safeBody(body?.dealId);
    const question = safeBody(body?.question);
    if (!dealId) {
      return jsonResponse({ error: "Missing dealId" }, 400);
    }

    let hindsightMemoryContext = "";
    try {
      const bankId = `deal-${dealId}`;
      const recalledMemories = await hindsight.recall(bankId, question || "What are the core deal preferences, timeline, and updates?", {});
      if (recalledMemories && Array.isArray(recalledMemories)) {
        hindsightMemoryContext = recalledMemories.map((m: any) => `- ${m.content || m}`).join("\n");
      }
    } catch (hindsightErr: any) {
      console.log("Hindsight recall note (new bank):", hindsightErr?.message || hindsightErr);
    }

    console.log("DEAL-AI: loading deal context");
    const ctx = await loadDealContext(supabase, dealId, userId);
    if ("error" in ctx) {
      return jsonResponse({ error: ctx.error }, ctx.status);
    }
    console.log("DEAL-AI: deal context loaded");

    const enhancedContext = `${ctx.context}\n\nHINDSIGHT LONG-TERM MEMORIES:\n${hindsightMemoryContext || "None recorded."}`;

    console.log("DEAL-AI: processing action:", action);
    
    if (action === "chat") {
      if (!question) return jsonResponse({ error: "Missing question" }, 400);

      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${enhancedContext}\n\nUSER QUESTION: ${question}` },
      ];

      let answer = "";
      try {
        answer = await callLLM(messages);
      } catch (err: any) {
        console.error("CHAT LLM ERROR:", err?.message || err);
        return jsonResponse({ error: `AI generation failed: ${err?.message || "Please try again."}` }, 502);
      }

      await supabase.from("conversations").insert({ deal_id: dealId, user_id: userId, role: "assistant", message: answer });
      await supabase.from("deal_activities").insert({ deal_id: dealId, user_id: userId, activity_type: "ai_conversation", description: "AI agent conversation" });

      try {
        await hindsight.retain(`deal-${dealId}`, `User asked: "${question}". Assistant answered: "${answer}"`, {
          context: "Deal intelligence chat session",
          timestamp: new Date().toISOString(),
        });
      } catch (retainErr) {
        console.error("Hindsight retain warning:", retainErr);
      }

      try {
        const memoryResponse = await callLLM([
          { role: "system", content: MEMORY_PROMPT },
          { role: "user", content: `User question: ${question}\nAssistant answer: ${answer}` },
        ], 300);
        const extracted = parseJsonArray(memoryResponse) as string[];
        if (extracted.length) {
          await supabase.from("memories").insert(
            extracted.map((content) => ({ deal_id: dealId, user_id: userId, memory_type: "Observation", content, source: "ai_conversation", importance: 4 })),
          );
        }
      } catch (memErr) {
        console.error("Memory extraction warning:", memErr);
      }

      return jsonResponse({ answer });
    }

    if (action === "meeting-prep") {
      const messages = [
        { role: "system", content: MEETING_PREP_PROMPT },
        { role: "user", content: enhancedContext },
      ];

      let answer = "";
      try {
        answer = await callLLM(messages, 800);
      } catch (err: any) {
        console.error("MEETING PREP LLM ERROR:", err?.message || err);
        return jsonResponse({ error: `Could not generate meeting prep: ${err?.message || "Please try again."}` }, 502);
      }

      await supabase.from("conversations").insert({ deal_id: dealId, user_id: userId, role: "user", message: "Prepare me for my next meeting" });
      await supabase.from("conversations").insert({ deal_id: dealId, user_id: userId, role: "assistant", message: answer });
      await supabase.from("deal_activities").insert({ deal_id: dealId, user_id: userId, activity_type: "meeting_prep", description: "Meeting preparation generated" });

      return jsonResponse({ answer });
    }

    if (action === "risk-analysis") {
      const messages = [
        { role: "system", content: RISK_ANALYSIS_PROMPT },
        { role: "user", content: enhancedContext },
      ];

      let answer = "";
      try {
        answer = await callLLM(messages, 800);
      } catch (err: any) {
        console.error("RISK ANALYSIS LLM ERROR:", err?.message || err);
        return jsonResponse({ error: `Could not generate risk analysis: ${err?.message || "Please try again."}` }, 502);
      }

      const risks = parseJsonArray(answer) as { risk: string; level: string; explanation: string }[];

      await supabase.from("conversations").insert({ deal_id: dealId, user_id: userId, role: "user", message: "What are the biggest risks?" });
      await supabase.from("conversations").insert({ deal_id: dealId, user_id: userId, role: "assistant", message: answer });
      await supabase.from("deal_activities").insert({ deal_id: dealId, user_id: userId, activity_type: "risk_analysis", description: "Risk analysis generated" });

      return jsonResponse({ risks: risks.length ? risks : [{ risk: "No risks identified", level: "Low", explanation: "Unable to parse risk analysis." }] });
    }

    if (action === "insights") {
      const messages = [
        { role: "system", content: INSIGHTS_PROMPT },
        { role: "user", content: enhancedContext },
      ];

      let answer = "";
      try {
        answer = await callLLM(messages, 600);
      } catch (err: any) {
        console.error("INSIGHTS LLM ERROR:", err?.message || err);
        return jsonResponse({ error: `Could not generate insights: ${err?.message || "Please try again."}` }, 502);
      }

      const parsed = parseJsonArray(answer) as { type: string; title: string; description: string }[];

      await supabase.from("insights").delete().eq("deal_id", dealId).eq("source", "ai");
      if (parsed.length) {
        await supabase.from("insights").insert(
          parsed.map((item) => ({
            deal_id: dealId,
            user_id: userId,
            type: item.type || "summary",
            title: item.title || "Insight",
            description: item.description || "",
            severity: item.type === "risk" ? "warning" : "info",
            source: "ai",
          })),
        );
      }

      await supabase.from("deal_activities").insert({ deal_id: dealId, user_id: userId, activity_type: "insights_generated", description: "AI insights generated" });

      return jsonResponse({ insights: parsed });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (error: any) {
    console.error("DEAL-AI CRITICAL ERROR:", error?.message || error, error?.stack);
    return jsonResponse({ error: `Something went wrong: ${error?.message || "Internal server error"}` }, 500);
  }
});