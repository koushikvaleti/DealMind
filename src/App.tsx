import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Building2,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import {
  supabase,
  type Conversation,
  type Customer,
  type Deal,
  type Insight,
  type Memory,
} from "@/lib/supabase";

type View =
  | "dashboard"
  | "deals"
  | "new"
  | "detail"
  | "agent"
  | "memory"
  | "settings";
type User = {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string };
};
const stages = [
  "Discovery",
  "Qualification",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];
const industries = [
  "SaaS",
  "Fintech",
  "Healthcare",
  "E-commerce",
  "Professional Services",
  "Manufacturing",
];
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
const date = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not recorded";

function route(): { view: View; id?: string } {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "deals" && parts[1] === "new") return { view: "new" };
  if (parts[0] === "deals" && parts[1]) return { view: "detail", id: parts[1] };
  if (parts[0] === "ai-agent" && parts[1])
    return { view: "agent", id: parts[1] };
  if (parts[0] === "memory" && parts[1])
    return { view: "memory", id: parts[1] };
  if (parts[0] === "deals") return { view: "deals" };
  if (parts[0] === "ai-agent") return { view: "agent" };
  if (parts[0] === "memory") return { view: "memory" };
  if (parts[0] === "settings") return { view: "settings" };
  return { view: "dashboard" };
}

function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
function friendlyError() {
  return "Something went wrong. Please try again.";
}
async function invokeDealAI(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token)
    throw new Error("Your session has expired. Please sign in again.");
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deal-ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [current, setCurrent] = useState(route());
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const listener = () => setCurrent(route());
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (user) loadDeals();
  }, [user]);
  useEffect(() => {
    if (notice) {
      const timer = window.setTimeout(() => setNotice(null), 4200);
      return () => window.clearTimeout(timer);
    }
  }, [notice]);
  async function loadDeals() {
    setDealsLoading(true);
    setDealsError("");
    const { data, error } = await supabase
      .from("deals")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      setDealsError("Your deals could not be loaded. Check your connection and retry.");
      setDeals([]);
    } else {
      setDeals((data || []) as Deal[]);
    }
    setDealsLoading(false);
  }
  if (authLoading)
    return (
      <div className="min-h-screen grid place-items-center bg-[#f4f7fb]">
        <Sparkles className="animate-pulse text-blue-600" />
      </div>
    );
  if (!user) return <AuthScreen onSuccess={() => {}} />;
  const selectedDeal = deals.find((deal) => deal.id === current.id) ?? deals[0];
  return (
    <AppShell
      current={current.view}
      user={user}
      notice={notice}
      onNotice={setNotice}
      onNavigate={go}
      onLogout={async () => {
        await supabase.auth.signOut();
        go("/login");
      }}
    >
      {current.view === "dashboard" && (
        <Dashboard
          deals={deals}
          loading={dealsLoading}
          loadError={dealsError}
          onRetry={loadDeals}
          onNavigate={go}
          userName={
            user.user_metadata?.full_name ||
            user.email?.split("@")[0] ||
            "there"
          }
        />
      )}
      {current.view === "deals" && (
        <DealsPage
          deals={deals}
          loading={dealsLoading}
          loadError={dealsError}
          onRetry={loadDeals}
          onNavigate={go}
          onRefresh={loadDeals}
          onNotice={setNotice}
        />
      )}
      {current.view === "new" && (
        <CreateDeal
          onCancel={() => go("/deals")}
          onCreated={async (id) => {
            await loadDeals();
            setNotice("Deal created successfully.");
            go(`/deals/${id}`);
          }}
        />
      )}
      {current.view === "detail" && selectedDeal && (
        <DealDetail
          deal={selectedDeal}
          onNavigate={go}
          onRefresh={loadDeals}
          onNotice={setNotice}
          deals={deals}
        />
      )}
      {current.view === "agent" && selectedDeal && (
        <Agent deal={selectedDeal} onNavigate={go} />
      )}
      {current.view === "memory" && selectedDeal && (
        <MemoryPage deals={deals} initialDeal={selectedDeal} />
      )}
      {current.view === "settings" && (
        <SettingsPage user={user} onNotice={setNotice} />
      )}
      {!selectedDeal &&
        current.view !== "dashboard" &&
        current.view !== "deals" &&
        current.view !== "new" && (
          <EmptyState
            title="Choose a deal first"
            text="Create a deal to unlock intelligence for this workspace."
            action="Create deal"
            onAction={() => go("/deals/new")}
          />
        )}
    </AppShell>
  );
}

function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [signup, setSignup] = useState(window.location.pathname === "/signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = signup
        ? await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: name } },
          })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        setError(
          signup
            ? "Unable to create account. Check your details and try again."
            : "Email or password is incorrect.",
        );
      } else if (signup && !result.data.session) {
        setMessage("Check your email to confirm your account, then sign in.");
      } else {
        onSuccess();
      }
    } catch {
      setError("The authentication service is unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-[#102542] grid lg:grid-cols-2 text-white">
      <section className="hidden lg:flex p-16 flex-col justify-between bg-[radial-gradient(circle_at_20%_20%,#254c88,transparent_42%),#102542]">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500 grid place-items-center">
            <Sparkles size={21} />
          </div>
          <div>
            <div className="font-display font-bold text-lg">DealMind</div>
            <div className="text-[10px] uppercase tracking-[.22em] text-blue-200">
              Deal intelligence agent
            </div>
          </div>
        </div>
        <div>
          <p className="text-blue-200 text-sm font-semibold mb-4">
            A clearer path to your next close.
          </p>
          <h1 className="font-display text-5xl xl:text-6xl font-extrabold leading-[1.05] max-w-xl">
            Know every deal.
            <br />
            <span className="text-blue-300">Move it forward.</span>
          </h1>
          <p className="text-slate-300 mt-7 max-w-md leading-7">
            DealMind brings customer context, deal health, and practical next
            steps into one focused workspace.
          </p>
        </div>
        <div className="text-sm text-slate-400">
          Secure by design · Built for thoughtful sales teams
        </div>
      </section>
      <section className="bg-[#f4f7fb] text-[#13243d] p-6 sm:p-12 flex items-center justify-center">
        <form onSubmit={submit} className="w-full max-w-md" aria-busy={busy}>
          <div className="lg:hidden flex items-center gap-3 mb-14">
            <div className="h-10 w-10 rounded-xl bg-[#102542] text-white grid place-items-center">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="font-display font-bold text-lg">DealMind</div>
              <div className="text-[10px] uppercase tracking-[.2em] text-slate-500">
                Deal intelligence agent
              </div>
            </div>
          </div>
          <div className="mb-9">
            <p className="text-sm font-semibold text-blue-600 mb-2">
              Welcome to DealMind
            </p>
            <h2 className="font-display text-3xl font-extrabold">
              {signup ? "Create your workspace" : "Welcome back"}
            </h2>
            <p className="text-slate-500 mt-2">
              {signup
                ? "Start building intelligence around your pipeline."
                : "Sign in to continue to your deals."}
            </p>
          </div>
          {signup && (
            <Field label="Full name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Alex Morgan"
              />
            </Field>
          )}
          <Field label="Work email">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              placeholder="you@company.com"
            />
          </Field>
          <Field label="Password">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              type="password"
              placeholder="At least 6 characters"
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-5">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-5">
              {message}
            </p>
          )}
          <button
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl py-3.5 font-bold transition"
          >
            {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSignup(!signup);
              setError("");
              setMessage("");
            }}
            className="w-full mt-5 text-sm text-slate-500 hover:text-blue-600"
          >
            {signup
              ? "Already have an account? Sign in"
              : "New to DealMind? Create an account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function AppShell({
  children,
  current,
  user,
  onNavigate,
  onLogout,
  notice,
}: {
  children: ReactNode;
  current: View;
  user: User;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  notice: string | null;
  onNotice: (value: string) => void;
}) {
  const [mobile, setMobile] = useState(false);
  const nav = [
    { label: "Dashboard", icon: LayoutDashboard, path: "/" },
    { label: "Deals", icon: Building2, path: "/deals" },
    { label: "AI Agent", icon: Bot, path: "/ai-agent" },
    { label: "Memory / Insights", icon: ShieldCheck, path: "/memory" },
  ];
  return (
    <div className="min-h-screen bg-[#f4f7fb] flex text-[#13243d]">
      <aside
        className={`${mobile ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed z-30 inset-y-0 left-0 w-[254px] bg-[#102542] text-white transition-transform duration-200 flex flex-col p-5`}
      >
        <div className="flex items-center gap-3 px-3 py-2 mb-10">
          <div className="h-9 w-9 rounded-xl bg-blue-500 grid place-items-center">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="font-display font-bold">DealMind</div>
            <div className="text-[9px] uppercase tracking-[.16em] text-slate-400">
              Deal intelligence agent
            </div>
          </div>
        </div>
        <nav className="space-y-2">
          {nav.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                onNavigate(item.path);
                setMobile(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold transition ${current === (item.label === "Dashboard" ? "dashboard" : item.label === "Deals" ? "deals" : item.label === "AI Agent" ? "agent" : "memory") ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/10"}`}
            >
              <item.icon size={17} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          <button
            onClick={() => onNavigate("/settings")}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold ${current === "settings" ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/10"}`}
          >
            <Settings size={17} />
            Settings
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-semibold text-slate-300 hover:bg-white/10"
          >
            <LogOut size={17} />
            Log out
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="Close menu"
          onClick={() => setMobile(false)}
          className="fixed inset-0 z-20 bg-[#102542]/40 lg:hidden"
        />
      )}
      <div className="flex-1 lg:ml-[254px] min-w-0">
        <header className="h-[76px] bg-white border-b border-slate-200/80 flex items-center justify-between px-5 sm:px-8">
          <button
            onClick={() => setMobile(true)}
            className="lg:hidden p-2 -ml-2"
          >
            <Menu size={22} />
          </button>
          <div className="hidden sm:flex relative max-w-xs w-full">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={16}
            />
            <input
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm outline-none focus:border-blue-400"
              placeholder="Search deals…"
            />
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <div className="h-9 w-9 rounded-full bg-[#dceaff] text-blue-700 grid place-items-center font-bold text-sm">
              {(user.user_metadata?.full_name || user.email || "A")
                .charAt(0)
                .toUpperCase()}
            </div>
          </div>
        </header>
        <main className="p-5 sm:p-8 max-w-[1450px] mx-auto">{children}</main>
      </div>
      {notice && (
        <div className="fixed right-5 bottom-5 z-50 bg-[#102542] text-white rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 text-sm">
          <CircleCheck className="text-emerald-300" size={18} />
          {notice}
        </div>
      )}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="py-12 text-center text-sm text-slate-500">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600 align-middle mr-3" />
      {label}
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{message}</span>
      <button onClick={onRetry} className="shrink-0 rounded-md border border-red-200 bg-white px-3 py-2 font-semibold hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
        Retry
      </button>
    </div>
  );
}

function PageTitle({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
      <div>
        <p className="text-xs uppercase tracking-[.16em] text-blue-600 font-bold mb-2">
          {eyebrow}
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-slate-500 mt-2 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white border border-slate-200/80 rounded-xl shadow-[0_6px_24px_rgba(28,54,89,.04)] ${className}`}
    >
      {children}
    </div>
  );
}
function Dashboard({
  deals,
  loading,
  loadError,
  onRetry,
  onNavigate,
  userName,
}: {
  deals: Deal[];
  loading: boolean;
  loadError: string;
  onRetry: () => void;
  onNavigate: (path: string) => void;
  userName: string;
}) {
  const deal = deals[0];
  if (loading)
    return (
      <>
        <PageTitle eyebrow="Overview" title={`Good morning, ${userName}`} />
        <LoadingState label="Loading your deals…" />
      </>
    );
  if (loadError)
    return (
      <>
        <PageTitle eyebrow="Overview" title={`Good morning, ${userName}`} />
        <InlineError message={loadError} onRetry={onRetry} />
      </>
    );
  return (
    <>
      <PageTitle
        eyebrow="Overview"
        title={`Good morning, ${userName}`}
        subtitle="Here’s what’s happening with your deals today."
        action={
          <button
            onClick={() => onNavigate("/deals/new")}
            className="bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-bold flex items-center gap-2 hover:bg-blue-700"
          >
            <Plus size={16} /> New deal
          </button>
        }
      />
      {!deal ? (
        <EmptyState
          title="No deals yet"
          text="Create your first deal to start building deal intelligence."
          action="Create deal"
          onAction={() => onNavigate("/deals/new")}
        />
      ) : (
        <>
          <Card className="p-5 sm:p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 grid place-items-center">
                  <Building2 size={22} />
                </div>
                <div>
                  <h2 className="font-display font-bold text-lg">
                    {deal.company_name}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {deal.industry} <span className="mx-1">·</span>{" "}
                    {money(deal.deal_value)} <span className="mx-1">·</span>{" "}
                    {deal.stage}
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate(`/deals/${deal.id}`)}
                className="text-sm text-blue-600 font-bold flex items-center gap-1"
              >
                Open deal <ArrowRight size={15} />
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <StatCard
                icon={<CircleCheck />}
                label="Deal Health"
                value={`${deal.health_score}%`}
                hint={deal.health_score >= 70 ? "Healthy" : "Needs attention"}
                tone="green"
              />
              <StatCard
                icon={<CircleAlert />}
                label="Key Risk"
                value={deal.risk_summary || "No risk noted"}
                hint={deal.risk_level}
                tone="amber"
              />
              <StatCard
                icon={<Zap />}
                label="Next Action"
                value={deal.next_action || "Define next action"}
                hint={
                  deal.decision_maker
                    ? `${deal.decision_maker} meeting`
                    : "Keep momentum"
                }
                tone="blue"
              />
            </div>
          </Card>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5">
              <SectionTitle
                title="Deal overview"
                action={
                  <button
                    onClick={() => onNavigate(`/deals/${deal.id}`)}
                    className="text-xs text-blue-600 font-bold"
                  >
                    View details
                  </button>
                }
              />
              <div className="grid grid-cols-2 gap-y-5 mt-5">
                {[
                  ["Company", deal.company_name],
                  ["Deal value", money(deal.deal_value)],
                  ["Stage", deal.stage],
                  ["Industry", deal.industry],
                  ["Decision maker", deal.decision_maker || "Not recorded"],
                  ["Last interaction", date(deal.last_interaction)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-slate-400 mb-1">{label}</p>
                    <p className="text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <SectionTitle
                title="AI insights"
                action={
                  <button
                    onClick={() => onNavigate(`/ai-agent/${deal.id}`)}
                    className="text-xs text-blue-600 font-bold"
                  >
                    Ask DealMind
                  </button>
                }
              />
              <div className="mt-5 rounded-lg bg-blue-50/70 border border-blue-100 p-4">
                <div className="flex gap-3">
                  <Lightbulb className="text-blue-600 shrink-0" size={18} />
                  <p className="text-sm leading-6 text-slate-700">
                    AI insights are generated from this deal’s customer context,
                    conversations, and saved memories.
                  </p>
                </div>
              </div>
              <button
                onClick={() => onNavigate(`/ai-agent/${deal.id}`)}
                className="mt-4 w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold hover:border-blue-300"
              >
                Prepare for your next meeting{" "}
                <ArrowRight className="inline ml-1" size={15} />
              </button>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  const colors: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
  };
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
        <span
          className={`h-7 w-7 rounded-lg grid place-items-center ${colors[tone]}`}
        >
          {icon}
        </span>
        {label}
      </div>
      <p className="font-display font-extrabold text-lg mt-4 truncate">
        {value}
      </p>
      <p
        className={`text-xs font-semibold mt-1 ${tone === "amber" ? "text-amber-600" : "text-emerald-600"}`}
      >
        {hint}
      </p>
    </div>
  );
}
function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-display font-bold">{title}</h3>
      {action}
    </div>
  );
}

function DealsPage({
  deals,
  loading,
  loadError,
  onRetry,
  onNavigate,
  onRefresh,
  onNotice,
}: {
  deals: Deal[];
  loading: boolean;
  loadError: string;
  onRetry: () => void;
  onNavigate: (path: string) => void;
  onRefresh: () => Promise<void>;
  onNotice: (msg: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("All stages");
  const [sort, setSort] = useState("updated_at");
  const visible = useMemo(
    () =>
      deals
        .filter(
          (d) =>
            `${d.company_name} ${d.industry}`
              .toLowerCase()
              .includes(search.toLowerCase()) &&
            (stage === "All stages" || d.stage === stage),
        )
        .sort((a, b) =>
          sort === "deal_value"
            ? b.deal_value - a.deal_value
            : sort === "health_score"
              ? b.health_score - a.health_score
              : b.updated_at.localeCompare(a.updated_at),
        ),
    [deals, search, stage, sort],
  );
  async function remove(id: string) {
    if (!window.confirm("Delete this deal and its associated intelligence?"))
      return;
    const { error } = await supabase.from("deals").delete().eq("id", id);
    if (error) onNotice(friendlyError());
    else {
      await onRefresh();
      onNotice("Deal deleted.");
    }
  }
  if (loading)
    return (
      <>
        <PageTitle eyebrow="Pipeline" title="Deals" />
        <LoadingState label="Loading deals…" />
      </>
    );
  if (loadError)
    return (
      <>
        <PageTitle eyebrow="Pipeline" title="Deals" />
        <InlineError message={loadError} onRetry={onRetry} />
      </>
    );
  if (!deals.length)
    return (
      <>
        <PageTitle eyebrow="Pipeline" title="Deals" />
        <EmptyState
          title="No deals yet"
          text="Create your first deal to start building deal intelligence."
          action="Create deal"
          onAction={() => onNavigate("/deals/new")}
        />
      </>
    );
  return (
    <>
      <PageTitle
        eyebrow="Pipeline"
        title="Deals"
        subtitle="Manage your opportunities and keep every next step visible."
        action={
          <button
            onClick={() => onNavigate("/deals/new")}
            className="bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-bold flex items-center gap-2"
          >
            <Plus size={16} /> New deal
          </button>
        }
      />
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={16}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies or industries…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm outline-none"
            />
          </div>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
          >
            <option>All stages</option>
            {stages.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
          >
            <option value="updated_at">Recently updated</option>
            <option value="deal_value">Highest value</option>
            <option value="health_score">Highest health</option>
          </select>
        </div>
        {visible.length === 0 ? (
          <EmptyState
            title="No matching deals"
            text="Try another search or create a new deal."
            action="Create deal"
            onAction={() => onNavigate("/deals/new")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  {[
                    "Company",
                    "Value",
                    "Stage",
                    "Health",
                    "Risk",
                    "Next action",
                    "",
                  ].map((h) => (
                    <th key={h} className="px-5 py-3 font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((deal) => (
                  <tr key={deal.id} className="hover:bg-blue-50/30 transition">
                    <td className="px-5 py-4">
                      <button
                        onClick={() => onNavigate(`/deals/${deal.id}`)}
                        className="font-bold text-sm hover:text-blue-600"
                      >
                        {deal.company_name}
                      </button>
                      <p className="text-xs text-slate-400 mt-1">
                        {deal.industry}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold">
                      {money(deal.deal_value)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge>{deal.stage}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-sm font-bold ${deal.health_score >= 70 ? "text-emerald-600" : "text-amber-600"}`}
                      >
                        {deal.health_score}%
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {deal.risk_summary || "—"}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600 max-w-[190px] truncate">
                      {deal.next_action || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => remove(deal.id)}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 border border-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-700">
      {children}
    </span>
  );
}

function CreateDeal({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({
    company_name: "",
    deal_value: "",
    industry: "",
    stage: "",
    decision_maker: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function change(key: string, value: string) {
    setForm((old) => ({ ...old, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { data, error: dealError } = await supabase
      .from("deals")
      .insert({
        company_name: form.company_name.trim(),
        deal_value: Number(form.deal_value),
        industry: form.industry,
        stage: form.stage,
        decision_maker: form.decision_maker.trim(),
        health_score: 50,
        risk_level: "Medium",
        risk_summary: "Needs discovery",
        next_action: "Define the next customer step",
        last_interaction: new Date().toISOString(),
      })
      .select()
      .maybeSingle();
    if (dealError || !data) {
      setBusy(false);
      setError(
        "Could not create the deal. Please check the fields and try again.",
      );
      return;
    }
    if (form.notes.trim())
      await supabase
        .from("customers")
        .insert({
          deal_id: data.id,
          name: form.decision_maker.trim() || "Primary contact",
          role: form.decision_maker.trim(),
          company: form.company_name.trim(),
          notes: form.notes.trim(),
        });
    await supabase
      .from("deal_activities")
      .insert({
        deal_id: data.id,
        activity_type: "deal_created",
        description: "Deal created and ready for intelligence.",
      });
    if (form.notes.trim())
      await supabase
        .from("memories")
        .insert({
          deal_id: data.id,
          memory_type: "Observation",
          content: form.notes.trim(),
          source: "initial customer information",
          importance: 4,
        });
    setBusy(false);
    onCreated(data.id);
  }
  return (
    <>
      <PageTitle
        eyebrow="New opportunity"
        title="Create new deal"
        subtitle="Add a new customer and start building deal intelligence."
      />
      <form onSubmit={submit} className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Deal information" />
          <div className="mt-6 space-y-4">
            <Field label="Company name *">
              <input
                required
                value={form.company_name}
                onChange={(e) => change("company_name", e.target.value)}
                placeholder="e.g. ACME Corporation"
              />
            </Field>
            <Field label="Deal value (USD) *">
              <input
                required
                min="0"
                type="number"
                value={form.deal_value}
                onChange={(e) => change("deal_value", e.target.value)}
                placeholder="120000"
              />
            </Field>
            <Field label="Industry *">
              <select
                required
                value={form.industry}
                onChange={(e) => change("industry", e.target.value)}
              >
                <option value="">Select industry</option>
                {industries.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Stage *">
              <select
                required
                value={form.stage}
                onChange={(e) => change("stage", e.target.value)}
              >
                <option value="">Select stage</option>
                {stages.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Decision maker">
              <input
                value={form.decision_maker}
                onChange={(e) => change("decision_maker", e.target.value)}
                placeholder="e.g. CTO, CEO, Procurement"
              />
            </Field>
          </div>
        </Card>
        <Card className="p-5 sm:p-6 flex flex-col">
          <SectionTitle
            title="Initial customer information"
            action={<span className="text-xs text-slate-400">Optional</span>}
          />
          <p className="text-sm text-slate-500 mt-2">
            Share what you already know so DealMind can make the next
            conversation more useful.
          </p>
          <textarea
            maxLength={500}
            value={form.notes}
            onChange={(e) => change("notes", e.target.value)}
            placeholder="Add initial notes about the customer, interactions, concerns or key information…"
            className="mt-5 w-full min-h-[180px] resize-none rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
          />
          <div className="text-right text-xs text-slate-400 mt-2">
            {form.notes.length}/500
          </div>
          <div className="mt-auto pt-6 flex flex-col-reverse sm:flex-row justify-end gap-3">
            {error && (
              <p className="text-sm text-red-600 mr-auto self-center">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-bold"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 text-sm font-bold"
            >
              {busy ? "Creating…" : "Create deal"}
            </button>
          </div>
        </Card>
      </form>
    </>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <div className="mt-2 [&>input]:w-full [&>input]:rounded-lg [&>input]:border [&>input]:border-slate-200 [&>input]:px-3 [&>input]:py-2.5 [&>input]:text-sm [&>input]:outline-none [&>input:focus]:border-blue-400 [&>select]:w-full [&>select]:rounded-lg [&>select]:border [&>select]:border-slate-200 [&>select]:px-3 [&>select]:py-2.5 [&>select]:text-sm [&>select]:outline-none">
        {children}
      </div>
    </label>
  );
}

function DealDetail({
  deal,
  onNavigate,
  onRefresh,
  onNotice,
  deals,
}: {
  deal: Deal;
  onNavigate: (path: string) => void;
  onRefresh: () => Promise<void>;
  onNotice: (msg: string) => void;
  deals: Deal[];
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("customers").select("*").eq("deal_id", deal.id),
      supabase
        .from("insights")
        .select("*")
        .eq("deal_id", deal.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("memories")
        .select("*")
        .eq("deal_id", deal.id)
        .order("updated_at", { ascending: false }),
    ]).then(([c, i, m]) => {
      setCustomers((c.data || []) as Customer[]);
      setInsights((i.data || []) as Insight[]);
      setMemories((m.data || []) as Memory[]);
      setLoading(false);
    });
  }, [deal.id]);
  async function updateHealth() {
    const next = Math.min(100, deal.health_score + 5);
    await supabase
      .from("deals")
      .update({ health_score: next })
      .eq("id", deal.id);
    await onRefresh();
    onNotice("Deal health updated.");
  }
  const [generating, setGenerating] = useState(false);
  async function generateInsights() {
    setGenerating(true);
    const response = await invokeDealAI({
      action: "insights",
      dealId: deal.id,
    }).catch(() => null);
    if (response?.ok) {
      const { data: refreshed } = await supabase
        .from("insights")
        .select("*")
        .eq("deal_id", deal.id)
        .order("created_at", { ascending: false });
      if (refreshed) setInsights(refreshed as Insight[]);
      onNotice("AI insights generated.");
    } else {
      onNotice("Could not generate insights right now.");
    }
    setGenerating(false);
  }
  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => onNavigate("/deals")}
          className="h-9 w-9 rounded-lg border border-slate-200 bg-white grid place-items-center"
        >
          <ArrowLeft size={17} />
        </button>
        <div>
          <p className="text-xs text-slate-500">Deal overview</p>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold">
              {deal.company_name}
            </h1>
            <Badge>{deal.stage}</Badge>
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold hover:border-blue-300"
          >
            <Pencil size={16} /> Edit
          </button>
          <button
            onClick={() => onNavigate(`/ai-agent/${deal.id}`)}
            className="hidden sm:flex items-center gap-2 rounded-lg bg-blue-600 text-white px-3 py-2 text-sm font-bold"
          >
            <Bot size={16} /> AI Agent
          </button>
          <button
            onClick={() => onNavigate(`/memory/${deal.id}`)}
            className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold"
          >
            <ShieldCheck size={16} /> Memory
          </button>
        </div>
        {editing && (
          <EditDealModal
            deal={deal}
            onClose={() => setEditing(false)}
            onSaved={async () => {
              await onRefresh();
              setEditing(false);
              onNotice("Deal updated.");
            }}
          />
        )}
      </div>
      {loading ? (
        <DealDetailSkeleton />
      ) : (
        <div className="grid xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <Card className="p-5">
              <SectionTitle title="Deal overview" />
              <div className="grid sm:grid-cols-3 gap-5 mt-5">
                {[
                  ["Company", deal.company_name],
                  ["Value", money(deal.deal_value)],
                  ["Industry", deal.industry],
                  ["Decision maker", deal.decision_maker || "Not recorded"],
                  ["Last interaction", date(deal.last_interaction)],
                  ["Next action", deal.next_action || "Not defined"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-slate-400 mb-1">{label}</p>
                    <p className="text-sm font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <SectionTitle
                title="AI insights"
                action={
                  <button
                    onClick={generateInsights}
                    disabled={generating}
                    className="text-xs text-blue-600 font-bold disabled:opacity-50"
                  >
                    {generating ? "Generating…" : "Generate insights"}
                  </button>
                }
              />
              <div className="mt-4 space-y-3">
                {insights.length ? (
                  insights.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-lg bg-blue-50/70 border border-blue-100"
                    >
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <Lightbulb size={16} className="text-blue-600" />
                        {item.title}
                      </div>
                      <p className="text-sm text-slate-600 mt-2 leading-6">
                        {item.description}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="p-4 rounded-lg bg-slate-50 text-sm text-slate-500">
                    Ask the AI Agent to generate insights from this deal’s real
                    context.
                  </div>
                )}
              </div>
            </Card>
            <Card className="p-5">
              <SectionTitle title="Customer information" />
              <div className="mt-4">
                {customers.length ? (
                  customers.map((customer) => (
                    <div key={customer.id} className="flex gap-3">
                      <div className="h-9 w-9 rounded-full bg-blue-50 text-blue-600 grid place-items-center">
                        <UserRound size={17} />
                      </div>
                      <div>
                        <p className="text-sm font-bold">
                          {customer.name}{" "}
                          <span className="text-slate-400 font-normal">
                            {customer.role && `· ${customer.role}`}
                          </span>
                        </p>
                        <p className="text-sm text-slate-600 mt-1 leading-6">
                          {customer.notes || "No notes recorded."}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No customer information has been added yet.
                  </p>
                )}
              </div>
            </Card>
          </div>
          <div className="space-y-6">
            <Card className="p-5">
              <SectionTitle
                title="Memory"
                action={
                  <button
                    onClick={() => onNavigate(`/memory/${deal.id}`)}
                    className="text-xs text-blue-600 font-bold"
                  >
                    View all
                  </button>
                }
              />
              <div className="mt-4 space-y-3">
                {memories.slice(0, 3).map((memory) => (
                  <div
                    key={memory.id}
                    className="border-l-2 border-blue-400 pl-3"
                  >
                    <p className="text-xs font-bold text-blue-600">
                      {memory.memory_type}
                    </p>
                    <p className="text-sm mt-1 leading-5">{memory.content}</p>
                  </div>
                ))}
                {!memories.length && (
                  <p className="text-sm text-slate-500">
                    No memories saved yet.
                  </p>
                )}
              </div>
            </Card>
            <Card className="p-5">
              <SectionTitle title="Next action" />
              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 p-4">
                <p className="text-sm font-bold text-amber-900">
                  {deal.next_action || "Define the next action"}
                </p>
                <p className="text-xs text-amber-700 mt-2">
                  Keep momentum by making the next customer step explicit.
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Agent({
  deal,
  onNavigate,
}: {
  deal: Deal;
  onNavigate: (path: string) => void;
}) {
  const [messages, setMessages] = useState<Conversation[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadingLabel, setLoadingLabel] = useState("");
  const [memoryStatus, setMemoryStatus] = useState<{
    available: boolean;
    count: number;
  } | null>(null);
  useEffect(() => {
    supabase
      .from("conversations")
      .select("*")
      .eq("deal_id", deal.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data || []) as Conversation[]));
  }, [deal.id]);
  const prompts: {
    label: string;
    action: "chat" | "meeting-prep" | "risk-analysis";
    display: string;
  }[] = [
    {
      label: "Prepare me for my next meeting",
      action: "meeting-prep",
      display: "Prepare me for my next meeting",
    },
    {
      label: "What are the biggest risks?",
      action: "risk-analysis",
      display: "What are the biggest risks?",
    },
    {
      label: "What objections should I expect?",
      action: "chat",
      display: "What objections should I expect?",
    },
    {
      label: "Summarize previous conversations",
      action: "chat",
      display: "Summarize previous conversations",
    },
  ];
  async function callAI(action: string, question: string, displayText: string) {
    setBusy(true);
    setError("");
    setLoadingLabel(displayText);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setBusy(false);
      setLoadingLabel("");
      return;
    }
    if (action === "chat") {
      const { data: saved, error: saveError } = await supabase
        .from("conversations")
        .insert({
          deal_id: deal.id,
          user_id: userId,
          role: "user",
          message: question,
        })
        .select()
        .maybeSingle();
      if (saveError) {
        setError("Your question could not be saved. Please try again.");
        setBusy(false);
        setLoadingLabel("");
        return;
      }
      if (saved) setMessages((old) => [...old, saved as Conversation]);
    }
    const response = await invokeDealAI({
      action,
      dealId: deal.id,
      question,
    }).catch(() => null);
    let reply = "";
    if (response?.ok) {
      const body = await response.json();
      reply = typeof body.answer === "string" ? body.answer : "";
      setMemoryStatus({
        available: body.hindsightAvailable === true,
        count: Number(body.recalledMemoryCount) || 0,
      });
      if (action === "risk-analysis" && body.risks) {
        reply = body.risks
          .map(
            (r: { risk: string; level: string; explanation: string }) =>
              `**${r.risk}** (${r.level})\n${r.explanation}`,
          )
          .join("\n\n");
      }
    }
    if (!reply) {
      setError(
        "AI response could not be generated right now. Your question was saved.",
      );
      setBusy(false);
      setLoadingLabel("");
      return;
    }
    const { data: assistant } = await supabase
      .from("conversations")
      .select("*")
      .eq("deal_id", deal.id)
      .eq("user_id", userId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (assistant) setMessages((old) => [...old, assistant as Conversation]);
    setBusy(false);
    setLoadingLabel("");
  }
  async function send(value = text) {
    const message = value.trim();
    if (!message || busy) return;
    setText("");
    await callAI("chat", message, message);
  }
  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => onNavigate(`/deals/${deal.id}`)}
          className="h-9 w-9 rounded-lg border border-slate-200 bg-white grid place-items-center"
        >
          <ArrowLeft size={17} />
        </button>
        <div>
          <h1 className="font-display text-2xl font-extrabold">
            DealMind <span className="text-blue-600">✦</span>
          </h1>
          <p className="text-sm text-slate-500">
            Your deal intelligence partner
          </p>
        </div>
      </div>
      <div className="grid xl:grid-cols-[1fr_310px] gap-6 items-start">
        <Card className="min-h-[650px] flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-blue-50 text-blue-600 grid place-items-center">
              <Bot size={18} />
            </div>
            <div>
              <p className="font-bold text-sm">DealMind AI</p>
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{" "}
                Uses your deal context
              </p>
            </div>
          </div>
          <div className="flex-1 p-5 space-y-5 overflow-y-auto soft-scroll">
            {messages.length === 0 && (
              <div className="h-full min-h-[390px] grid place-items-center text-center">
                <div>
                  <div className="h-14 w-14 rounded-2xl bg-blue-50 text-blue-600 grid place-items-center mx-auto mb-4">
                    <Sparkles size={24} />
                  </div>
                  <h3 className="font-display font-bold text-lg">
                    What would you like to know?
                  </h3>
                  <p className="text-sm text-slate-500 mt-2 max-w-sm">
                    Ask about risks, customers, meeting preparation, or anything
                    in your deal context.
                  </p>
                </div>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap ${message.role === "user" ? "bg-blue-600 text-white rounded-br-sm" : "bg-slate-50 border border-slate-100 rounded-bl-sm"}`}
                >
                  {message.message}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex gap-2 items-center text-sm text-slate-400">
                <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce" />
                <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:100ms]" />
                <span className="h-2 w-2 rounded-full bg-blue-400 animate-bounce [animation-delay:200ms]" />{" "}
                {loadingLabel === "Prepare me for my next meeting"
                  ? "Generating meeting preparation…"
                  : loadingLabel === "What are the biggest risks?"
                    ? "Analyzing risks…"
                    : "DealMind is thinking…"}
              </div>
            )}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                {error}
              </p>
            )}
          </div>
          <div className="p-4 border-t border-slate-100">
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="Ask about this deal…"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400"
              />
              <button
                onClick={() => send()}
                disabled={!text.trim() || busy}
                className="h-11 w-11 rounded-lg bg-blue-600 text-white grid place-items-center disabled:opacity-40"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Deal context" />
          <div className="mt-5 space-y-4">
            {[
              ["Company", deal.company_name],
              ["Value", money(deal.deal_value)],
              ["Stage", deal.stage],
              ["Industry", deal.industry],
              ["Decision maker", deal.decision_maker || "Not recorded"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 text-sm">
                <span className="text-slate-400">{label}</span>
                <span className="font-semibold text-right">{value}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 mt-6 pt-5">
            <p className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3">
              Suggested prompts
            </p>
            <div className="space-y-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt.label}
                  disabled={busy}
                  onClick={() =>
                    callAI(prompt.action, prompt.display, prompt.display)
                  }
                  className="w-full text-left rounded-lg bg-blue-50 text-blue-700 px-3 py-2.5 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function MemoryPage({
  deals,
  initialDeal,
}: {
  deals: Deal[];
  initialDeal: Deal;
}) {
  const [dealId, setDealId] = useState(initialDeal.id);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("All");
  const deal = deals.find((d) => d.id === dealId) || initialDeal;
  useEffect(() => {
    supabase
      .from("memories")
      .select("*")
      .eq("deal_id", dealId)
      .order("updated_at", { ascending: false })
      .then(({ data }) => setMemories((data || []) as Memory[]));
  }, [dealId]);
  const visible = memories.filter(
    (memory) =>
      memory.content.toLowerCase().includes(search.toLowerCase()) &&
      (type === "All" || memory.memory_type === type),
  );
  return (
    <>
      <PageTitle
        eyebrow="Long-term context"
        title="Memory / Insights"
        subtitle={`Here’s what DealMind remembers about ${deal.company_name}.`}
        action={
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-semibold"
          >
            {deals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.company_name}
              </option>
            ))}
          </select>
        }
      />
      <div className="grid xl:grid-cols-[1fr_1.15fr] gap-6">
        <Card className="p-5">
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={16}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search memories…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm outline-none"
              />
            </div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              <option>All</option>
              <option>Experience</option>
              <option>World</option>
              <option>Observation</option>
            </select>
          </div>
          <SectionTitle title="What DealMind remembers" />
          <div className="mt-4 space-y-3">
            {visible.length ? (
              visible.map((memory) => (
                <div
                  key={memory.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Badge>{memory.memory_type}</Badge>
                    <span className="text-[11px] text-slate-400">
                      {date(memory.updated_at)}
                    </span>
                  </div>
                  <p className="text-sm leading-6 mt-3">{memory.content}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    Source: {memory.source}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState
                title="No memories yet"
                text="Important context from your conversations will appear here."
              />
            )}
          </div>
        </Card>
        <Card className="p-5">
          <SectionTitle title="Conversation timeline" />
          <div className="mt-5 space-y-5">
            {memories.length ? (
              memories.map((memory) => (
                <div key={memory.id} className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-blue-50 text-blue-600 grid place-items-center shrink-0">
                    <Clock3 size={14} />
                  </div>
                  <div className="border-b border-slate-100 pb-4 flex-1">
                    <div className="flex justify-between gap-3">
                      <p className="text-sm font-bold">
                        {memory.memory_type} recorded
                      </p>
                      <span className="text-xs text-slate-400">
                        {date(memory.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-2 leading-6">
                      {memory.content}
                    </p>
                    <span className="inline-block mt-2 rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-[10px] font-bold">
                      Memory stored
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No timeline events yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function SettingsPage({
  user,
  onNotice,
}: {
  user: User;
  onNotice: (msg: string) => void;
}) {
  const [name, setName] = useState(user.user_metadata?.full_name || "");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: name },
    });
    setBusy(false);
    onNotice(error ? friendlyError() : "Profile updated.");
  }
  return (
    <>
      <PageTitle
        eyebrow="Workspace"
        title="Settings"
        subtitle="Manage your profile and connected intelligence services."
      />
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Profile" />
          <form onSubmit={save} className="mt-6 space-y-4">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </Field>
            <Field label="Email">
              <input disabled value={user.email || ""} />
            </Field>
            <button
              disabled={busy}
              className="bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </form>
        </Card>
        <Card className="p-5 sm:p-6">
          <SectionTitle title="Connected services" />
          <div className="mt-5 space-y-3">
            {[
              ["Supabase", "Application database and authentication", true],
              ["AI provider", "Used for deal reasoning and responses", false],
              ["Hindsight", "Long-term deal memory", false],
            ].map(([label, description, active]) => (
              <div
                key={label as string}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
              >
                <div>
                  <p className="text-sm font-bold">{label as string}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {description as string}
                  </p>
                </div>
                <span
                  className={`text-xs font-bold ${active ? "text-emerald-600" : "text-slate-400"}`}
                >
                  {active ? "Connected" : "Not configured"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-5 leading-5">
            Provider credentials are kept on the secure server and are never
            displayed here.
          </p>
        </Card>
      </div>
    </>
  );
}
function EditDealModal({
  deal,
  onClose,
  onSaved,
}: {
  deal: Deal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    company_name: deal.company_name,
    deal_value: String(deal.deal_value),
    industry: deal.industry,
    stage: deal.stage,
    decision_maker: deal.decision_maker,
    health_score: String(deal.health_score),
    risk_level: deal.risk_level,
    risk_summary: deal.risk_summary,
    next_action: deal.next_action,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function change(key: string, value: string) {
    setForm((old) => ({ ...old, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase
      .from("deals")
      .update({
        company_name: form.company_name.trim(),
        deal_value: Number(form.deal_value),
        industry: form.industry,
        stage: form.stage,
        decision_maker: form.decision_maker.trim(),
        health_score: Math.min(
          100,
          Math.max(0, Number(form.health_score) || 0),
        ),
        risk_level: form.risk_level,
        risk_summary: form.risk_summary.trim(),
        next_action: form.next_action.trim(),
        last_interaction: new Date().toISOString(),
      })
      .eq("id", deal.id);
    setBusy(false);
    if (updateError) {
      setError("Could not update the deal. Please try again.");
      return;
    }
    onSaved();
  }
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#102542]/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto soft-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-display font-bold text-lg">Edit deal</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <Field label="Company name *">
            <input
              required
              value={form.company_name}
              onChange={(e) => change("company_name", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Deal value (USD) *">
              <input
                required
                min="0"
                type="number"
                value={form.deal_value}
                onChange={(e) => change("deal_value", e.target.value)}
              />
            </Field>
            <Field label="Health score (0–100)">
              <input
                type="number"
                min="0"
                max="100"
                value={form.health_score}
                onChange={(e) => change("health_score", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Industry *">
              <select
                required
                value={form.industry}
                onChange={(e) => change("industry", e.target.value)}
              >
                {industries.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Stage *">
              <select
                required
                value={form.stage}
                onChange={(e) => change("stage", e.target.value)}
              >
                {stages.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Decision maker">
            <input
              value={form.decision_maker}
              onChange={(e) => change("decision_maker", e.target.value)}
            />
          </Field>
          <Field label="Risk level">
            <select
              value={form.risk_level}
              onChange={(e) => change("risk_level", e.target.value)}
            >
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
          </Field>
          <Field label="Risk summary">
            <input
              value={form.risk_summary}
              onChange={(e) => change("risk_summary", e.target.value)}
            />
          </Field>
          <Field label="Next action">
            <input
              value={form.next_action}
              onChange={(e) => change("next_action", e.target.value)}
            />
          </Field>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-bold"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-5 py-2.5 text-sm font-bold"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-slate-100 rounded-lg ${className}`} />
  );
}
function DealDetailSkeleton() {
  return (
    <div className="grid xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 space-y-6">
        <Card className="p-5">
          <Skeleton className="h-5 w-32 mb-5" />
          <div className="grid sm:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <Skeleton className="h-5 w-24 mb-5" />
          <Skeleton className="h-16 w-full" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-5 w-32 mb-5" />
          <Skeleton className="h-12 w-full" />
        </Card>
      </div>
      <div className="space-y-6">
        <Card className="p-5">
          <Skeleton className="h-5 w-20 mb-5" />
          <Skeleton className="h-16 w-full" />
        </Card>
        <Card className="p-5">
          <Skeleton className="h-5 w-24 mb-5" />
          <Skeleton className="h-16 w-full" />
        </Card>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="py-16 text-center px-5">
      <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 grid place-items-center mx-auto mb-4">
        <FileText size={21} />
      </div>
      <h3 className="font-display font-bold text-lg">{title}</h3>
      <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">{text}</p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="mt-5 bg-blue-600 text-white rounded-lg px-4 py-2.5 text-sm font-bold"
        >
          {action}
        </button>
      )}
    </div>
  );
}