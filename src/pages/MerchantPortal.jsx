import React, { useCallback, useEffect, useRef, useState } from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import {
  enqueueMerchant,
  merchantQueue,
  removeMerchantQueued,
} from "../merchant-offline.js";
import "../merchant.css";
import {
  Store,
  ShoppingBag,
  UsersRound,
  Wallet,
  Settings2,
  LogOut,
  Plus,
  ArrowRight,
  Check,
  Copy,
  MessageCircle,
  Smartphone,
  Download,
  Share2,
  ShieldCheck,
  Globe2,
  LockKeyhole,
  UserRoundPlus,
  ExternalLink,
  RefreshCw,
  Wifi,
  WifiOff,
  ImagePlus,
  Menu,
  X,
} from "lucide-react";

const words = {
  fr: {
    welcome: "Votre commerce, simplement.",
    intro: "Clients, commandes et paiements manuels dans votre pays.",
    login: "Connexion",
    signup: "Créer un compte",
    name: "Votre nom",
    business: "Nom de l’entreprise",
    country: "Pays de l’entreprise",
    phone: "Téléphone",
    email: "Adresse e-mail",
    password: "Mot de passe",
    confirm: "Confirmer le mot de passe",
    send: "Continuer",
    dashboard: "Vue d’ensemble",
    clients: "Clients",
    orders: "Commandes",
    methods: "Moyens de paiement",
    team: "Personnel",
    account: "Mon compte",
    newClient: "Ajouter un client",
    newOrder: "Nouvelle commande",
    client: "Client",
    description: "Description",
    amount: "Montant",
    consent: "Le client accepte d’être contacté par WhatsApp et SMS",
    pending: "En attente",
    review: "À vérifier",
    paid: "Payée",
    cancelled: "Annulée",
    makeLink: "Créer un lien (48 h)",
    markPaid: "Marquer comme payé",
    save: "Enregistrer",
    logout: "Se déconnecter",
    install: "Télécharger maintenant",
    invite: "Inviter un membre",
    language: "Langue",
    forgot: "Mot de passe oublié ?",
    reset: "Réinitialiser le mot de passe",
    noApi:
      "Aucune API de paiement ou de messages. Vérifiez chaque paiement avant de le valider.",
    selectClient: "Sélectionner un client existant",
    already: "Vous avez un compte ?",
    noAccount: "Nouveau marchand ?",
    chooseCountry: "Choisissez un pays",
    share: "Partager le lien",
    wa: "Envoyer par WhatsApp",
    sms: "Envoyer par SMS",
    reference: "Référence",
    enabled: "Activer",
    destination: "Numéro destinataire",
    bank: "Instructions de virement",
    qr: "Téléverser un QR de paiement",
    step1: "1. Choisissez votre moyen de paiement",
    step2: "2. Effectuez le paiement depuis votre téléphone",
    step3: "3. Indiquez la référence de la transaction",
    claim: "J’ai payé",
    claimDone: "Référence reçue. Le marchand vérifiera votre paiement.",
    expiry: "Ce lien expire le",
    privacy: "Aucun paiement n’est confirmé automatiquement.",
    appName: "Espace marchand",
  },
  en: {
    welcome: "Your business, made simple.",
    intro: "Customers, orders and manual payments in your country.",
    login: "Sign in",
    signup: "Create an account",
    name: "Your name",
    business: "Business name",
    country: "Business country",
    phone: "Phone",
    email: "Email address",
    password: "Password",
    confirm: "Confirm password",
    send: "Continue",
    dashboard: "Overview",
    clients: "Customers",
    orders: "Orders",
    methods: "Payment methods",
    team: "Staff",
    account: "My account",
    newClient: "Add a customer",
    newOrder: "New order",
    client: "Customer",
    description: "Description",
    amount: "Amount",
    consent: "The customer agrees to receive WhatsApp and SMS messages",
    pending: "Pending",
    review: "To verify",
    paid: "Paid",
    cancelled: "Cancelled",
    makeLink: "Create a link (48 h)",
    markPaid: "Mark as paid",
    save: "Save",
    logout: "Sign out",
    install: "Download now",
    invite: "Invite a staff member",
    language: "Language",
    forgot: "Forgot password?",
    reset: "Reset password",
    noApi:
      "No payment or messaging API. Check each payment before confirming it.",
    selectClient: "Select an existing customer",
    already: "Already have an account?",
    noAccount: "New merchant?",
    chooseCountry: "Choose a country",
    share: "Share the link",
    wa: "Send with WhatsApp",
    sms: "Send with SMS",
    reference: "Reference",
    enabled: "Enable",
    destination: "Recipient number",
    bank: "Bank transfer instructions",
    qr: "Upload payment QR",
    step1: "1. Choose a payment method",
    step2: "2. Pay from your phone",
    step3: "3. Enter the transaction reference",
    claim: "I have paid",
    claimDone: "Reference received. The merchant will check your payment.",
    expiry: "This link expires on",
    privacy: "No payment is confirmed automatically.",
    appName: "Merchant space",
  },
};
async function request(path, { method = "GET", body, merchant } = {}) {
  const form = body instanceof FormData;
  let r;
  try {
    r = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "KouturePro",
        ...(form ? {} : { "Content-Type": "application/json" }),
        ...(merchant ? { "X-Merchant-Id": merchant } : {}),
      },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
  } catch (error) {
    error.network = true;
    throw error;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const error = new Error(data.error || data.message || `Erreur ${r.status}`);
    error.status = r.status;
    throw error;
  }
  return data;
}
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  navigator.standalone === true;
function useInstall() {
  const [prompt, setPrompt] = useState(null),
    [installed, setInstalled] = useState(isStandalone);
  useEffect(() => {
    const on = (e) => {
        e.preventDefault();
        setPrompt(e);
      },
      done = () => {
        setPrompt(null);
        setInstalled(true);
      };
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", done);
    return () => {
      window.removeEventListener("beforeinstallprompt", on);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  const ios =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !/CriOS|FxiOS/i.test(navigator.userAgent);
  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    }
  };
  return { prompt, installed, ios, install };
}
const format = (minor, currency, decimals, locale) =>
  new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(minor) / 10 ** decimals);
function ErrorBox({ error }) {
  return (
    error && (
      <div className="mp-error" role="alert">
        {error}
      </div>
    )
  );
}
function Field({ label, children }) {
  return (
    <label className="mp-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function CountrySelect({ countries, locale, value, onChange, label }) {
  return (
    <Field label={label}>
      <select required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{words[locale].chooseCountry}</option>
        {countries.map((c) => (
          <option value={c.code} key={c.code}>
            {c.flag} {locale === "en" ? c.name_en : c.name_fr} · {c.dial_code}
          </option>
        ))}
      </select>
    </Field>
  );
}
function validPhone(raw, country, lang) {
  const phone = parsePhoneNumberFromString(String(raw || "").trim(), country);
  if (!phone?.isValid() || phone.country !== country)
    throw new Error(
      lang === "en"
        ? "Check the phone number and dialling code."
        : "Vérifiez le numéro de téléphone et son indicatif.",
    );
  return phone.number;
}
function PhoneField({
  label,
  countries,
  country,
  onCountryChange,
  value,
  onChange,
  lang,
  required = false,
  disabled = false,
  autoComplete,
}) {
  const selected = countries.find((c) => c.code === country);
  return (
    <div className="mp-field">
      <span>{label}</span>
      <div className="mp-phone">
        <select
          aria-label={
            lang === "en" ? "Dialling code" : "Indicatif téléphonique"
          }
          value={country}
          onChange={(e) => onCountryChange(e.target.value)}
          disabled={disabled}
          required
        >
          <option value="">+</option>
          {countries.map((c) => (
            <option value={c.code} key={c.code}>
              {c.flag} {c.dial_code}
            </option>
          ))}
        </select>
        <input
          aria-label={label}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={selected?.dial_code ? selected.dial_code + " …" : "+"}
        />
      </div>
    </div>
  );
}
function InstallBanner({ lang }) {
  const { prompt, installed, ios, install } = useInstall();
  const [instructions, setInstructions] = useState(false);
  if (installed) return null;
  return (
    <div className="mp-install">
      <Download size={21} />
      <div>
        <strong>{words[lang].install}</strong>
        <small>
          {ios
            ? "Sur iPhone : touchez Partager, puis « Sur l’écran d’accueil »."
            : lang === "en"
              ? "Keep this app on your home screen."
              : "Gardez cette application sur votre écran d’accueil."}
        </small>
      </div>
      <button
        onClick={() => (prompt ? install() : setInstructions(!instructions))}
        className="mp-btn mp-btn-primary"
      >
        {words[lang].install}
      </button>
      {instructions && (
        <p className="mp-install-help" role="status">
          {ios
            ? lang === "en"
              ? "In Safari, tap Share and then Add to Home Screen."
              : "Dans Safari, touchez Partager puis « Sur l’écran d’accueil »."
            : lang === "en"
              ? "Open your browser menu and choose Install app or Add to home screen."
              : "Dans le menu du navigateur, choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil »."}
        </p>
      )}
    </div>
  );
}
function AuthView({
  lang,
  countries,
  complete,
  setError,
  error,
  resetAvailable,
  invite,
}) {
  const t = words[lang],
    [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [state, setState] = useState({
      name: "",
      business: "",
      country: "",
      phone: "",
      email: "",
      password: "",
      confirmation: "",
    }),
    [notice, setNotice] = useState("");
  const set = (key, v) => {
    setState((old) => ({ ...old, [key]: v }));
    setError("");
  };
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    let created = false;
    try {
      if (mode === "reset") {
        if (!resetAvailable)
          throw new Error("Le service d’e-mail doit d’abord être configuré.");
        await request("/api/m-auth/request-password-reset", {
          method: "POST",
          body: {
            email: state.email,
            redirectTo: location.origin + "/marchands/reset",
          },
        });
        setNotice(
          lang === "en"
            ? "If the address exists, you will receive an email."
            : "Si cette adresse existe, vous recevrez un e-mail.",
        );
        return;
      }
      if (mode === "signup") {
        if (!invite) validPhone(state.phone, state.country, lang);
        if (state.password !== state.confirmation)
          throw new Error(
            lang === "en"
              ? "Passwords do not match."
              : "Les mots de passe ne correspondent pas.",
          );
        await request("/api/m-auth/sign-up/email", {
          method: "POST",
          body: {
            name: state.name,
            email: state.email,
            password: state.password,
          },
        });
        created = true;
        if (!invite)
          await request("/api/merchant/register", {
            method: "POST",
            body: {
              business_name: state.business,
              country_code: state.country,
              phone: validPhone(state.phone, state.country, lang),
              locale: lang,
            },
          });
      } else
        await request("/api/m-auth/sign-in/email", {
          method: "POST",
          body: { email: state.email, password: state.password },
        });
      await complete(invite);
    } catch (e) {
      if (created && !invite) await complete(""); // account exists; continue on the registration step
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mp-auth-layout">
      <section className="mp-auth-intro">
        <div className="mp-mark">
          <Store size={26} />
        </div>
        <span className="mp-kicker">
          KOUTUREPRO · {t.appName.toUpperCase()}
        </span>
        <h1>{t.welcome}</h1>
        <p>{t.intro}</p>
        <div className="mp-auth-highlights">
          <span>
            <ShieldCheck size={17} /> {t.privacy}
          </span>
          <span>
            <Globe2 size={17} /> Afrique de l’Ouest / West Africa
          </span>
        </div>
      </section>
      <section className="mp-auth-card">
        <div className="mp-auth-heading">
          <h2>
            {mode === "signup"
              ? t.signup
              : mode === "reset"
                ? t.reset
                : t.login}
          </h2>
          <a href="/auth">
            {lang === "en" ? "Atelier space" : "Espace atelier"}{" "}
            <ArrowRight size={15} />
          </a>
        </div>
        {invite && (
          <p className="mp-info">
            {lang === "en"
              ? "Sign in with the invited email, then accept the staff invitation."
              : "Connectez-vous avec l’e-mail invité pour rejoindre l’entreprise."}
          </p>
        )}
        <form onSubmit={submit} className="mp-form">
          {mode === "signup" && (
            <>
              <Field label={t.name}>
                <input
                  required
                  autoComplete="name"
                  value={state.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Awa Koné"
                />
              </Field>
              {!invite && (
                <>
                  <Field label={t.business}>
                    <input
                      required
                      value={state.business}
                      onChange={(e) => set("business", e.target.value)}
                      placeholder="Atelier Koné"
                    />
                  </Field>
                  <CountrySelect
                    countries={countries}
                    locale={lang}
                    value={state.country}
                    onChange={(v) => set("country", v)}
                    label={t.country}
                  />
                  <PhoneField
                    label={t.phone}
                    countries={countries}
                    country={state.country}
                    onCountryChange={(v) => set("country", v)}
                    value={state.phone}
                    onChange={(v) => set("phone", v)}
                    lang={lang}
                    autoComplete="tel"
                    required
                  />
                </>
              )}
            </>
          )}
          <Field label={t.email}>
            <input
              required
              type="email"
              autoComplete="email"
              value={state.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="vous@entreprise.com"
            />
          </Field>
          {mode !== "reset" && (
            <Field label={t.password}>
              <input
                required
                type="password"
                minLength={mode === "signup" ? 10 : undefined}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={state.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </Field>
          )}
          {mode === "signup" && (
            <Field label={t.confirm}>
              <input
                required
                type="password"
                minLength={10}
                autoComplete="new-password"
                value={state.confirmation}
                onChange={(e) => set("confirmation", e.target.value)}
              />
            </Field>
          )}
          <ErrorBox error={error} />
          {notice && (
            <div className="mp-success" role="status">
              {notice}
            </div>
          )}
          <button
            className="mp-btn mp-btn-primary"
            type="submit"
            disabled={busy}
          >
            {busy
              ? "…"
              : mode === "signup"
                ? t.signup
                : mode === "reset"
                  ? t.reset
                  : t.login}{" "}
            <ArrowRight size={17} />
          </button>
        </form>
        <div className="mp-switch">
          {mode === "login" ? (
            <>
              <button type="button" onClick={() => setMode("signup")}>
                {t.noAccount} {t.signup}
              </button>
              {resetAvailable && (
                <button type="button" onClick={() => setMode("reset")}>
                  {t.forgot}
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => setMode("login")}>
              {t.already} {t.login}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
function RegisterView({ lang, countries, user, onComplete, setError, error }) {
  const t = words[lang],
    [state, setState] = useState({ business: "", country: "", phone: "" }),
    [busy, setBusy] = useState(false);
  return (
    <div className="mp-simple">
      <div className="mp-panel">
        <h1>{t.business}</h1>
        <p>
          {lang === "en"
            ? "Finish creating your business to open the dashboard."
            : "Terminez la création de votre entreprise pour ouvrir le tableau de bord."}
        </p>
        <form
          className="mp-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request("/api/merchant/register", {
                method: "POST",
                body: {
                  business_name: state.business,
                  country_code: state.country,
                  phone: validPhone(state.phone, state.country, lang),
                  locale: lang,
                },
              });
              await onComplete();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t.name}>
            <input value={user?.name || ""} disabled />
          </Field>
          <Field label={t.business}>
            <input
              required
              value={state.business}
              onChange={(e) => setState({ ...state, business: e.target.value })}
            />
          </Field>
          <CountrySelect
            countries={countries}
            locale={lang}
            value={state.country}
            onChange={(v) => setState({ ...state, country: v })}
            label={t.country}
          />
          <PhoneField
            label={t.phone}
            countries={countries}
            country={state.country}
            onCountryChange={(v) => setState({ ...state, country: v })}
            value={state.phone}
            onChange={(v) => setState({ ...state, phone: v })}
            lang={lang}
            autoComplete="tel"
            required
          />
          <ErrorBox error={error} />
          <button className="mp-btn mp-btn-primary" disabled={busy}>
            {t.send} <ArrowRight size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}

function MerchantDashboard({
  lang,
  setLang,
  countries,
  merchant,
  load,
  onSignOut,
  notice,
  setNotice,
  error,
  setError,
  online,
  pending,
  syncing,
  setPending,
  onSync,
  queueError,
  onDropQueued,
}) {
  const t = words[lang],
    [view, setView] = useState("dashboard"),
    [details, setDetails] = useState(null),
    [link, setLink] = useState(null),
    [share, setShare] = useState(null),
    [confirmation, setConfirmation] = useState(null),
    [busy, setBusy] = useState(false),
    [drawer, setDrawer] = useState(false),
    [search, setSearch] = useState(""),
    [clientSearch, setClientSearch] = useState("");
  const [clientForm, setClientForm] = useState({
      name: "",
      phone: "",
      phone_country: merchant.merchant.country_code,
      notes: "",
      consent: false,
    }),
    [orderForm, setOrderForm] = useState({
      client_id: "",
      description: "",
      amount: "",
    }),
    [inviteEmail, setInviteEmail] = useState(""),
    [invite, setInvite] = useState(null),
    [passwords, setPasswords] = useState({
      currentPassword: "",
      newPassword: "",
    }),
    [selectedCountry, setSelectedCountry] = useState(
      merchant.merchant.country_code,
    );
  useEffect(
    () => setSelectedCountry(merchant.merchant.country_code),
    [merchant.merchant.country_code],
  );
  const profile = merchant.merchant,
    selected = countries.find((c) => c.code === profile.country_code),
    allowed = selected?.operators || [],
    owner = profile.role === "marchand";
  const refreshed = async () => {
    const data = await request("/api/merchant/dashboard", {
      merchant: profile.id,
    });
    load({ ...data, user: merchant.user });
  };
  useEffect(() => {
    const update = () => { if (navigator.onLine && document.visibilityState === 'visible') refreshed().catch(() => {}); };
    const timer = window.setInterval(update, 30000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); window.removeEventListener('focus', update); };
  }, []);
  const run = async (fn, { allowOffline = false } = {}) => {
    if (!navigator.onLine && !allowOffline) {
      setError(
        lang === "en"
          ? "This action requires an internet connection."
          : "Cette action nécessite une connexion Internet.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const addMutation = async (path, body, optimistic) => {
    const id = crypto.randomUUID();
    const entry = {
      id,
      path,
      method: "POST",
      body: { ...body, id },
      org_id: profile.id,
      user_id: merchant.user.id,
    };
    const queue = async () => {
      await enqueueMerchant(entry);
      load((previous) => optimistic(previous, id));
      setPending((count) => count + 1);
      setNotice(
        lang === "en"
          ? "Saved on this device. It will sync when you reconnect."
          : "Enregistré sur cet appareil. Synchronisation à la reconnexion.",
      );
    };
    if (!navigator.onLine) return queue();
    try {
      await request(path, {
        method: "POST",
        merchant: profile.id,
        body: entry.body,
      });
      await refreshed();
    } catch (error) {
      if (error.network) return queue();
      throw error;
    }
  };
  const money = (order) =>
    format(
      order.amount_minor,
      order.currency,
      countries.find((c) => c.code === order.country_code)?.decimals ??
        profile.decimals,
      lang,
    );
  const tabs = [
    ["dashboard", t.dashboard, Store],
    ["clients", t.clients, UsersRound],
    ["orders", t.orders, ShoppingBag],
    ["methods", t.methods, Wallet],
    ["team", t.team, UserRoundPlus],
    ["account", t.account, Settings2],
  ];
  const statusLabel = (s) =>
    ({
      pending: t.pending,
      review: t.review,
      paid: t.paid,
      cancelled: t.cancelled,
    })[s] || s;
  return (
    <div className="merchant-v2">
      <aside className={"mp-sidebar " + (drawer ? "mp-open" : "")}>
        <a href="/marchands" className="mp-brand">
          <span>
            <Store size={20} />
          </span>
          <strong>
            Kouture<span>Pro</span>
          </strong>
        </a>
        <div className="mp-workspace">
          <span className="mp-store-icon">{profile.name?.slice(0, 1)}</span>
          <div>
            <strong>{profile.name}</strong>
            <small>
              {selected?.flag}{" "}
              {selected
                ? lang === "en"
                  ? selected.name_en
                  : selected.name_fr
                : ""}{" "}
              · {profile.currency}
            </small>
          </div>
        </div>
        <nav aria-label="Merchant menu">
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              className={view === key ? "mp-active" : ""}
              onClick={() => {
                setView(key);
                setDrawer(false);
                setError("");
                setNotice("");
              }}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="mp-sidebar-bottom">
          <a href="/app">
            {lang === "en" ? "Atelier space" : "Espace atelier"}{" "}
            <ExternalLink size={15} />
          </a>
          <button onClick={onSignOut}>
            <LogOut size={17} />
            {t.logout}
          </button>
        </div>
      </aside>
      <div className="mp-main">
        <header className="mp-top">
          <button
            className="mp-menu-button"
            onClick={() => setDrawer(!drawer)}
            aria-label="Menu"
          >
            {drawer ? <X /> : <Menu />}
          </button>
          <div>
            <span className="mp-eyebrow">{t.appName}</span>
            <strong>{tabs.find((x) => x[0] === view)?.[1]}</strong>
          </div>
          <div className="mp-top-actions">
            <button className="mp-refresh" type="button" aria-label={lang === 'en' ? 'Refresh' : 'Actualiser'} disabled={!online || busy || syncing}
              onClick={() => run(refreshed)}><RefreshCw size={17}/></button>
            <span
              className={
                "mp-connection " +
                (!online
                  ? "mp-offline"
                  : pending
                    ? "mp-pending"
                    : "mp-connected")
              }
              role="status"
              aria-label={
                !online
                  ? lang === "en"
                    ? "Offline, changes are stored locally"
                    : "Hors ligne, modifications enregistrées sur cet appareil"
                  : syncing
                    ? lang === "en"
                      ? "Syncing"
                      : "Synchronisation en cours"
                    : pending
                      ? `${pending} ${lang === "en" ? "changes awaiting sync" : "modifications en attente"}`
                      : lang === "en"
                        ? "Online"
                        : "En ligne"
              }
            >
              {!online ? (
                <WifiOff size={16} />
              ) : syncing ? (
                <RefreshCw size={16} />
              ) : (
                <Wifi size={16} />
              )}
              <span>
                {!online
                  ? lang === "en"
                    ? "Offline"
                    : "Hors ligne"
                  : syncing
                    ? lang === "en"
                      ? "Syncing"
                      : "Synchronisation"
                    : pending
                      ? `${pending} ${lang === "en" ? "pending" : "en attente"}`
                      : lang === "en"
                        ? "Online"
                        : "En ligne"}
              </span>
              {pending > 0 && <b>{pending}</b>}
            </span>
            <select
              aria-label={t.language}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
            </select>
            <span className="mp-top-avatar">{profile.name.slice(0, 1)}</span>
          </div>
        </header>
        <main className="mp-content">
          {!online && (
            <div className="mp-offline-notice" role="status">
              <WifiOff size={18} />
              {lang === "en"
                ? "Offline mode: customer and order drafts are kept encrypted on this device. Payment validation and settings need internet."
                : "Mode hors ligne : les nouveaux clients et commandes sont protégés sur cet appareil. Validation des paiements et réglages nécessitent Internet."}
            </div>
          )}
          {pending > 0 && online && !syncing && (
            <div className="mp-info" role="status">
              {pending}{" "}
              {lang === "en"
                ? "change(s) awaiting sync."
                : "modification(s) en attente de synchronisation."}{" "}
              <button className="mp-text-button" onClick={onSync}>
                {lang === "en" ? "Retry now" : "Réessayer"}
              </button>
            </div>
          )}
          {queueError && (
            <div className="mp-error" role="alert">
              {lang === "en" ? "Sync blocked: " : "Synchronisation bloquée : "}
              {queueError.message}
              {queueError.id && (
                <button className="mp-text-button" onClick={onDropQueued}>
                  {lang === "en"
                    ? "Discard blocked change"
                    : "Abandonner la modification bloquée"}
                </button>
              )}
            </div>
          )}
          <ErrorBox error={error} />
          {notice && (
            <div className="mp-success" role="status">
              {notice}
            </div>
          )}
          {view === "dashboard" && (
            <>
              <div className="mp-hero">
                <span>
                  {selected?.flag} {profile.currency} ·{" "}
                  {profile.role === "marchand" ? "Marchand" : "Personnel"}
                </span>
                <h1>{t.welcome}</h1>
                <p>{t.intro}</p>
                <button
                  className="mp-btn mp-btn-light"
                  onClick={() => setView("orders")}
                >
                  {t.newOrder} <ArrowRight size={17} />
                </button>
              </div>
              <InstallBanner lang={lang} />
              <div className="mp-stats">
                <div>
                  <small>{t.clients.toUpperCase()}</small>
                  <strong>{merchant.clients.length}</strong>
                </div>
                <div>
                  <small>{t.orders.toUpperCase()}</small>
                  <strong>{merchant.orders.length}</strong>
                </div>
                <div>
                  <small>{t.review.toUpperCase()}</small>
                  <strong>
                    {
                      merchant.orders.filter((o) => o.status === "review")
                        .length
                    }
                  </strong>
                </div>
              </div>
              <section className="mp-panel">
                <h2>{t.orders}</h2>
                {merchant.orders.slice(0, 5).map((o) => (
                  <div className="mp-row" key={o.id}>
                    <span>
                      <strong>{o.description || t.orders}</strong>
                      <small>{statusLabel(o.status)}</small>
                    </span>
                    <strong>{money(o)}</strong>
                  </div>
                ))}
                {!merchant.orders.length && (
                  <p className="mp-muted">
                    {lang === "en"
                      ? "Create your first order."
                      : "Créez votre première commande."}
                  </p>
                )}
              </section>
              <p className="mp-disclaimer">
                <ShieldCheck size={17} />
                {t.noApi}
              </p>
            </>
          )}
          {view === "clients" && (
            <div className="mp-columns">
              <section className="mp-panel">
                <h2>{t.newClient}</h2>
                <form
                  className="mp-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      async () => {
                        const body = {
                          ...clientForm,
                          phone: validPhone(
                            clientForm.phone,
                            clientForm.phone_country,
                            lang,
                          ),
                        };
                        await addMutation(
                          "/api/merchant/clients",
                          body,
                          (previous, id) => ({
                            ...previous,
                            clients: [
                              {
                                ...body,
                                id,
                                consent_at: body.consent
                                  ? new Date().toISOString()
                                  : "",
                                created_at: new Date().toISOString(),
                                offline: true,
                              },
                              ...previous.clients,
                            ],
                          }),
                        );
                        setClientForm({
                          name: "",
                          phone: "",
                          phone_country: profile.country_code,
                          notes: "",
                          consent: false,
                        });
                      },
                      { allowOffline: true },
                    );
                  }}
                >
                  <Field label={t.name}>
                    <input
                      required
                      value={clientForm.name}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, name: e.target.value })
                      }
                    />
                  </Field>
                  <PhoneField
                    label={t.phone}
                    countries={countries}
                    country={clientForm.phone_country}
                    lang={lang}
                    required
                    onCountryChange={(v) =>
                      setClientForm({ ...clientForm, phone_country: v })
                    }
                    value={clientForm.phone}
                    onChange={(v) => setClientForm({ ...clientForm, phone: v })}
                  />
                  <Field label={lang === "en" ? "Notes" : "Notes"}>
                    <textarea
                      rows={2}
                      value={clientForm.notes}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, notes: e.target.value })
                      }
                    />
                  </Field>
                  <label className="mp-consent">
                    <input
                      type="checkbox"
                      checked={clientForm.consent}
                      onChange={(e) =>
                        setClientForm({
                          ...clientForm,
                          consent: e.target.checked,
                        })
                      }
                    />
                    <span>{t.consent}</span>
                  </label>
                  <button className="mp-btn mp-btn-primary" disabled={busy}>
                    <Plus size={16} />
                    {t.newClient}
                  </button>
                </form>
              </section>
              <section className="mp-panel">
                <h2>
                  {t.clients} <small>{merchant.clients.length}</small>
                </h2>
                <Field
                  label={
                    lang === "en"
                      ? "Search by name or phone"
                      : "Rechercher par nom ou téléphone"
                  }
                >
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </Field>
                {merchant.clients
                  .filter(
                    (c) =>
                      !search ||
                      c.name.toLowerCase().includes(search.toLowerCase()) ||
                      c.phone.includes(search),
                  )
                  .map((c) => (
                    <div className="mp-row" key={c.id}>
                      <span>
                        <strong>{c.name}</strong>
                        <small>
                          {c.phone} ·{" "}
                          {c.consent
                            ? "WhatsApp / SMS"
                            : "Contact non autorisé"}
                        </small>
                      </span>
                      <span className="mp-actions">
                        {
                          countries.find((x) => x.code === c.phone_country)
                            ?.flag
                        }
                        {c.consent && !c.offline && (
                          <button
                            className="mp-btn mp-btn-small"
                            disabled={busy || !online}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  lang === "en"
                                    ? "Revoke this customer’s messaging consent?"
                                    : "Révoquer l’accord de ce client pour les messages ?",
                                )
                              )
                                return;
                              run(async () => {
                                await request(
                                  "/api/merchant/clients/" +
                                    c.id +
                                    "/revoke-consent",
                                  { method: "POST", merchant: profile.id },
                                );
                                await refreshed();
                              });
                            }}
                          >
                            {lang === "en"
                              ? "Revoke consent"
                              : "Révoquer l’accord"}
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                {!merchant.clients.length && (
                  <p className="mp-muted">
                    {lang === "en"
                      ? "No customers yet."
                      : "Aucun client pour le moment."}
                  </p>
                )}
              </section>
            </div>
          )}
          {view === "orders" && (
            <div className="mp-columns">
              <section className="mp-panel">
                <h2>{t.newOrder}</h2>
                <form
                  className="mp-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      async () => {
                        const parsed = Number(
                          orderForm.amount.replace(",", "."),
                        );
                        const minor = Math.round(
                          parsed * 10 ** profile.decimals,
                        );
                        if (!Number.isSafeInteger(minor) || minor <= 0)
                          throw new Error(
                            lang === "en"
                              ? "Invalid amount."
                              : "Montant invalide.",
                          );
                        const body = {
                          client_id: orderForm.client_id,
                          description: orderForm.description,
                          amount_minor: minor,
                        };
                        await addMutation(
                          "/api/merchant/orders",
                          body,
                          (previous, id) => ({
                            ...previous,
                            orders: [
                              {
                                ...body,
                                id,
                                currency: profile.currency,
                                country_code: profile.country_code,
                                status: "pending",
                                created_at: new Date().toISOString(),
                                offline: true,
                              },
                              ...previous.orders,
                            ],
                          }),
                        );
                        setOrderForm({
                          client_id: "",
                          description: "",
                          amount: "",
                        });
                        setClientSearch("");
                      },
                      { allowOffline: true },
                    );
                  }}
                >
                  <Field
                    label={
                      lang === "en"
                        ? "Find a customer by name or phone"
                        : "Chercher un client par nom ou téléphone"
                    }
                  >
                    <input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder={
                        lang === "en" ? "Name or phone" : "Nom ou numéro"
                      }
                    />
                  </Field>
                  <Field label={t.client}>
                    <select
                      required
                      value={orderForm.client_id}
                      onChange={(e) =>
                        setOrderForm({
                          ...orderForm,
                          client_id: e.target.value,
                        })
                      }
                    >
                      <option value="">{t.selectClient}</option>
                      {merchant.clients
                        .filter(
                          (c) =>
                            c.id === orderForm.client_id ||
                            !clientSearch ||
                            c.name
                              .toLocaleLowerCase()
                              .includes(clientSearch.toLocaleLowerCase()) ||
                            c.phone.includes(clientSearch),
                        )
                        .map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.name} · {c.phone}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <button
                    type="button"
                    className="mp-text-button"
                    onClick={() => setView("clients")}
                  >
                    + {t.newClient}
                  </button>
                  <Field label={t.description}>
                    <input
                      value={orderForm.description}
                      onChange={(e) =>
                        setOrderForm({
                          ...orderForm,
                          description: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label={`${t.amount} · ${profile.currency}`}>
                    <input
                      required
                      type="text"
                      inputMode="decimal"
                      pattern={
                        profile.decimals
                          ? `[0-9]+([.,][0-9]{1,${profile.decimals}})?`
                          : "[0-9]+"
                      }
                      value={orderForm.amount}
                      onChange={(e) =>
                        setOrderForm({ ...orderForm, amount: e.target.value })
                      }
                      placeholder={profile.decimals ? "120.50" : "12000"}
                    />
                  </Field>
                  <button disabled={busy} className="mp-btn mp-btn-primary">
                    <Plus size={16} />
                    {t.newOrder}
                  </button>
                </form>
              </section>
              <section className="mp-panel">
                <h2>
                  {t.orders} <small>{merchant.orders.length}</small>
                </h2>
                {merchant.orders.map((o) => {
                  const client = merchant.clients.find(
                    (c) => c.id === o.client_id,
                  );
                  return (
                    <div className="mp-order" key={o.id}>
                      <div className="mp-row">
                        <span>
                          <strong>{o.description || t.orders}</strong>
                          <small>
                            {client?.name} ·{" "}
                            {new Date(o.created_at).toLocaleDateString(
                              lang === "en" ? "en-GB" : "fr-FR",
                            )}
                          </small>
                        </span>
                        <strong>{money(o)}</strong>
                      </div>
                      <div className="mp-order-footer">
                        <span className={"mp-status mp-" + o.status}>
                          {statusLabel(o.status)}
                        </span>
                        <div>
                          {o.status === "pending" && (
                            <button
                              disabled={busy || !online || o.offline}
                              className="mp-btn mp-btn-small"
                              onClick={() =>
                                run(async () => {
                                  const data = await request(
                                    "/api/merchant/orders/" + o.id + "/link",
                                    { method: "POST", merchant: profile.id },
                                  );
                                  setLink({ ...data, orderId: o.id });
                                  setShare(null);
                                  setDetails(o.id);
                                })
                              }
                            >
                              {t.makeLink}
                            </button>
                          )}
                          {owner &&
                            ["pending", "review"].includes(o.status) && (
                              <button
                                className="mp-btn mp-btn-small"
                                disabled={busy || !online}
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      lang === "en"
                                        ? "Cancel this order and revoke its payment links?"
                                        : "Annuler cette commande et révoquer ses liens de paiement ?",
                                    )
                                  )
                                    return;
                                  run(async () => {
                                    await request(
                                      "/api/merchant/orders/" +
                                        o.id +
                                        "/cancel",
                                      { method: "POST", merchant: profile.id },
                                    );
                                    await refreshed();
                                  });
                                }}
                              >
                                {lang === "en" ? "Cancel order" : "Annuler"}
                              </button>
                            )}
                          {o.status === "review" && (
                            <button
                              disabled={busy || !online}
                              className="mp-btn mp-btn-small mp-btn-primary"
                              onClick={() =>
                                run(async () => {
                                  const data = await request(
                                    "/api/merchant/orders/" + o.id + "/paid",
                                    { method: "POST", merchant: profile.id },
                                  );
                                  setConfirmation(data.confirmation);
                                  setDetails(o.id);
                                  await refreshed();
                                })
                              }
                            >
                              {t.markPaid}
                            </button>
                          )}
                        </div>
                      </div>
                      {details === o.id &&
                        link?.orderId === o.id &&
                        o.status === "pending" && (
                          <div className="mp-share">
                            <span>
                              {t.expiry}{" "}
                              {new Date(link.expires_at).toLocaleString(
                                lang === "en" ? "en-GB" : "fr-FR",
                              )}
                            </span>
                            <div className="mp-share-url">
                              {link.url}
                              <button
                                aria-label="Copier le lien"
                                onClick={() =>
                                  navigator.clipboard
                                    .writeText(link.url)
                                    .then(() =>
                                      setNotice(
                                        lang === "en"
                                          ? "Link copied."
                                          : "Lien copié.",
                                      ),
                                    )
                                    .catch(() => setError("Copie impossible."))
                                }
                              >
                                <Copy size={16} />
                              </button>
                            </div>
                            <button
                              className="mp-btn"
                              disabled={busy || !online}
                              onClick={() =>
                                run(async () =>
                                  setShare(
                                    await request(
                                      "/api/merchant/orders/" + o.id + "/share",
                                      {
                                        method: "POST",
                                        merchant: profile.id,
                                        body: { url: link.url },
                                      },
                                    ),
                                  ),
                                )
                              }
                            >
                              {t.share}
                            </button>
                            {share && (
                              <div className="mp-actions">
                                <a
                                  className="mp-btn"
                                  href={share.whatsapp}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <MessageCircle size={16} />
                                  {t.wa}
                                </a>
                                <a className="mp-btn" href={share.sms}>
                                  <Smartphone size={16} />
                                  {t.sms}
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      {details === o.id &&
                        confirmation &&
                        o.status === "paid" && (
                          <div className="mp-actions">
                            <a
                              className="mp-btn"
                              href={confirmation.whatsapp}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <MessageCircle size={16} />
                              {t.wa}
                            </a>
                            <a className="mp-btn" href={confirmation.sms}>
                              <Smartphone size={16} />
                              {t.sms}
                            </a>
                          </div>
                        )}
                    </div>
                  );
                })}
                {!merchant.orders.length && (
                  <p className="mp-muted">
                    {lang === "en"
                      ? "No orders yet."
                      : "Aucune commande pour le moment."}
                  </p>
                )}
              </section>
            </div>
          )}
          {view === "methods" && (
            <section className="mp-panel">
              <h2>{t.methods}</h2>
              <p className="mp-muted">
                {lang === "en"
                  ? "Only you can change recipient numbers and QR codes."
                  : "Seul le propriétaire peut modifier les numéros et QR de paiement."}
              </p>
              <div className="mp-method-grid">
                {allowed.map((op) => (
                  <Method
                    key={op.code}
                    op={op}
                    current={merchant.settings.find(
                      (s) => s.operator_code === op.code,
                    )}
                    owner={owner}
                    lang={lang}
                    profile={profile}
                    countries={countries}
                    busy={busy}
                    online={online}
                    run={run}
                    refreshed={refreshed}
                  />
                ))}
              </div>
            </section>
          )}
          {view === "team" && (
            <section className="mp-panel">
              <h2>{t.team}</h2>
              {owner && (
                <form
                  className="mp-form mp-invite"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const result = await request(
                        "/api/merchant/invitations",
                        {
                          method: "POST",
                          merchant: profile.id,
                          body: { email: inviteEmail },
                        },
                      );
                      setInvite(result);
                      setInviteEmail("");
                      await refreshed();
                    });
                  }}
                >
                  <Field label={t.email}>
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </Field>
                  <button
                    className="mp-btn mp-btn-primary"
                    disabled={busy || !online}
                  >
                    <UserRoundPlus size={16} />
                    {t.invite}
                  </button>
                </form>
              )}
              {invite && (
                <div className="mp-share">
                  <p>
                    {lang === "en"
                      ? "Copy this one-time link and give it to your staff member. It expires after 72 hours."
                      : "Copiez ce lien à usage unique et transmettez-le au membre. Il expire après 72 heures."}
                  </p>
                  <div className="mp-share-url">
                    {invite.url}
                    <button
                      onClick={() => navigator.clipboard.writeText(invite.url)}
                      aria-label="Copier l’invitation"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              )}
              {merchant.team.map((m) => (
                <div className="mp-row" key={m.user_id}>
                  <span>
                    <strong>
                      {m.user_id === merchant?.user?.id
                        ? merchant.user.name
                        : m.email || m.user_id}
                    </strong>
                    <small>
                      {m.role} · {m.active ? "Actif" : "Désactivé"}
                    </small>
                  </span>
                  {owner && m.role === "personnel" && (
                    <div className="mp-actions">
                      <button
                        className="mp-btn mp-btn-small"
                        disabled={busy || !online}
                        onClick={() =>
                          run(async () => {
                            await request("/api/merchant/team/" + m.user_id, {
                              method: "PATCH",
                              merchant: profile.id,
                              body: { active: !m.active },
                            });
                            await refreshed();
                          })
                        }
                      >
                        {m.active
                          ? lang === "en"
                            ? "Disable"
                            : "Désactiver"
                          : lang === "en"
                            ? "Enable"
                            : "Réactiver"}
                      </button>
                      <button
                        className="mp-btn mp-btn-small"
                        disabled={busy || !online}
                        onClick={() => {
                          if (
                            !window.confirm(
                              lang === "en"
                                ? "Remove this staff member from the business?"
                                : "Retirer ce membre de l’entreprise ?",
                            )
                          )
                            return;
                          run(async () => {
                            await request("/api/merchant/team/" + m.user_id, {
                              method: "DELETE",
                              merchant: profile.id,
                            });
                            await refreshed();
                          });
                        }}
                      >
                        {lang === "en" ? "Remove" : "Supprimer"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {owner &&
                merchant.invitations?.some(
                  (i) =>
                    !i.used_at &&
                    !i.revoked_at &&
                    Date.parse(i.expires_at) > Date.now(),
                ) && (
                  <>
                    <h2 className="mp-subheading">
                      {lang === "en"
                        ? "Pending invitations"
                        : "Invitations en attente"}
                    </h2>
                    {merchant.invitations
                      .filter(
                        (i) =>
                          !i.used_at &&
                          !i.revoked_at &&
                          Date.parse(i.expires_at) > Date.now(),
                      )
                      .map((i) => (
                        <div className="mp-row" key={i.id}>
                          <span>
                            <strong>{i.email}</strong>
                            <small>
                              {t.expiry}{" "}
                              {new Date(i.expires_at).toLocaleString(
                                lang === "en" ? "en-GB" : "fr-FR",
                              )}
                            </small>
                          </span>
                          <button
                            className="mp-btn mp-btn-small"
                            disabled={busy || !online}
                            onClick={() =>
                              run(async () => {
                                await request(
                                  "/api/merchant/invitations/" + i.id,
                                  { method: "DELETE", merchant: profile.id },
                                );
                                if (invite?.id === i.id) setInvite(null);
                                await refreshed();
                              })
                            }
                          >
                            {lang === "en" ? "Revoke" : "Révoquer"}
                          </button>
                        </div>
                      ))}
                  </>
                )}
            </section>
          )}
          {view === "account" && (
            <div className="mp-columns">
              <section className="mp-panel">
                <h2>{t.account}</h2>
                <p>
                  {profile.name} · {selected?.flag} {selected?.name_fr}
                </p>
                <p>
                  {lang === "en" ? "Role" : "Rôle"} : {profile.role}
                </p>
                {owner && (
                  <form
                    className="mp-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () => {
                        await request("/api/merchant/profile", {
                          method: "PUT",
                          merchant: profile.id,
                          body: { country_code: selectedCountry, locale: lang },
                        });
                        await refreshed();
                        setNotice(
                          lang === "en"
                            ? "Preferences saved. Payment methods must be re-enabled after changing country."
                            : "Préférences enregistrées. Si le pays a changé, réactivez vos moyens de paiement.",
                        );
                      });
                    }}
                  >
                    <CountrySelect
                      countries={countries}
                      locale={lang}
                      value={selectedCountry}
                      onChange={setSelectedCountry}
                      label={t.country}
                    />
                    {selectedCountry !== profile.country_code && (
                      <p className="mp-info">
                        {lang === "en"
                          ? "Close or cancel outstanding orders before changing country. Existing paid orders keep their original currency."
                          : "Terminez ou annulez les commandes ouvertes avant de changer de pays. Les commandes payées gardent leur ancienne devise."}
                      </p>
                    )}
                    <Field label={t.language}>
                      <select
                        value={lang}
                        onChange={(e) => setLang(e.target.value)}
                      >
                        <option value="fr">Français</option>
                        <option value="en">English</option>
                      </select>
                    </Field>
                    <button
                      className="mp-btn mp-btn-primary"
                      disabled={busy || !online}
                    >
                      {t.save}
                    </button>
                  </form>
                )}
                {!owner && (
                  <Field label={t.language}>
                    <select
                      value={lang}
                      onChange={(e) => setLang(e.target.value)}
                    >
                      <option value="fr">Français</option>
                      <option value="en">English</option>
                    </select>
                  </Field>
                )}
                <InstallBanner lang={lang} />
              </section>
              <section className="mp-panel">
                <h2>
                  <LockKeyhole size={19} />{" "}
                  {lang === "en"
                    ? "Change password"
                    : "Changer le mot de passe"}
                </h2>
                <form
                  className="mp-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await request("/api/m-auth/change-password", {
                        method: "POST",
                        body: {
                          currentPassword: passwords.currentPassword,
                          newPassword: passwords.newPassword,
                          revokeOtherSessions: true,
                        },
                      });
                      setPasswords({ currentPassword: "", newPassword: "" });
                      setNotice(
                        lang === "en"
                          ? "Password changed."
                          : "Mot de passe modifié.",
                      );
                    });
                  }}
                >
                  <Field
                    label={
                      lang === "en" ? "Current password" : "Mot de passe actuel"
                    }
                  >
                    <input
                      required
                      type="password"
                      value={passwords.currentPassword}
                      onChange={(e) =>
                        setPasswords({
                          ...passwords,
                          currentPassword: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={
                      lang === "en" ? "New password" : "Nouveau mot de passe"
                    }
                  >
                    <input
                      required
                      type="password"
                      minLength={10}
                      value={passwords.newPassword}
                      onChange={(e) =>
                        setPasswords({
                          ...passwords,
                          newPassword: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <button
                    className="mp-btn mp-btn-primary"
                    disabled={busy || !online}
                  >
                    {t.save}
                  </button>
                </form>
              </section>
              {owner && (
                <section className="mp-panel mp-template-panel">
                  <h2>
                    {lang === "en"
                      ? "Editable messages"
                      : "Messages personnalisés"}{" "}
                    · {lang.toUpperCase()}
                  </h2>
                  <p className="mp-muted">
                    {lang === "en"
                      ? "Messages are never sent automatically. Only share them when the customer has explicitly agreed."
                      : "Aucun message n’est envoyé automatiquement. Ne partagez ces modèles qu’avec l’accord explicite du client."}
                  </p>
                  {["payment_link", "payment_confirmed"].map((kind) => (
                    <TemplateEditor
                      key={kind + lang}
                      kind={kind}
                      lang={lang}
                      current={merchant.templates.find(
                        (x) => x.kind === kind && x.locale === lang,
                      )}
                      profile={profile}
                      run={run}
                      refreshed={refreshed}
                      busy={busy}
                      online={online}
                    />
                  ))}
                  <p className="mp-muted">
                    {
                      "{client} · {entreprise} · {montant} · {lien} · {reference}"
                    }
                  </p>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
function TemplateEditor({
  kind,
  lang,
  current,
  profile,
  run,
  refreshed,
  busy,
  online,
}) {
  const [body, setBody] = useState(current?.body || "");
  useEffect(() => setBody(current?.body || ""), [current?.body]);
  return (
    <form
      className="mp-form mp-template"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await request("/api/merchant/templates/" + lang + "/" + kind, {
            method: "PUT",
            merchant: profile.id,
            body: { body },
          });
          await refreshed();
        });
      }}
    >
      <Field
        label={
          kind === "payment_link"
            ? lang === "en"
              ? "Payment link"
              : "Lien de paiement"
            : lang === "en"
              ? "Payment confirmation"
              : "Confirmation de paiement"
        }
      >
        <textarea
          required
          minLength={4}
          maxLength={2000}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <button className="mp-btn mp-btn-small" disabled={busy || !online}>
        {lang === "en" ? "Save template" : "Enregistrer le modèle"}
      </button>
    </form>
  );
}
function Method({
  op,
  current,
  owner,
  lang,
  profile,
  countries,
  busy,
  online,
  run,
  refreshed,
}) {
  const t = words[lang],
    [form, setForm] = useState({
      enabled: current?.enabled || false,
      destination: current?.destination || "",
      destination_country: current?.destination_country || profile.country_code,
      bank_instructions: current?.bank_instructions || "",
      qr_url: current?.qr_url || "",
    }),
    [uploading, setUploading] = useState(false);
  useEffect(() => {
    setForm({
      enabled: current?.enabled || false,
      destination: current?.destination || "",
      destination_country: current?.destination_country || profile.country_code,
      bank_instructions: current?.bank_instructions || "",
      qr_url: current?.qr_url || "",
    });
  }, [
    current?.id,
    current?.enabled,
    current?.destination,
    current?.destination_country,
    profile.country_code,
    current?.bank_instructions,
    current?.qr_url,
  ]);
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append("image", file);
      const response = await request("/api/merchant/settings/qr", {
        method: "POST",
        merchant: profile.id,
        body: data,
      });
      setForm((old) => ({ ...old, qr_url: response.url }));
    } catch (e) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  };
  return (
    <form
      className="mp-method"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await request("/api/merchant/settings/" + op.code, {
            method: "PUT",
            merchant: profile.id,
            body: {
              ...form,
              destination: form.destination
                ? validPhone(form.destination, form.destination_country, lang)
                : "",
            },
          });
          await refreshed();
        });
      }}
    >
      <div className="mp-method-header">
        <strong>{op.name}</strong>
        <label className="mp-toggle">
          <input
            type="checkbox"
            checked={form.enabled}
            disabled={!owner || !online}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          {t.enabled}
        </label>
      </div>
      <PhoneField
        label={t.destination}
        countries={countries}
        country={form.destination_country}
        lang={lang}
        disabled={!owner || !online}
        onCountryChange={(v) => setForm({ ...form, destination_country: v })}
        value={form.destination}
        onChange={(v) => setForm({ ...form, destination: v })}
      />
      {op.kind === "bank_transfer" && (
        <Field label={t.bank}>
          <textarea
            rows={2}
            disabled={!owner || !online}
            value={form.bank_instructions}
            onChange={(e) =>
              setForm({ ...form, bank_instructions: e.target.value })
            }
          />
        </Field>
      )}
      <label className="mp-qr-upload">
        <ImagePlus size={16} />
        {uploading ? "…" : form.qr_url ? t.qr + " ✓" : t.qr}
        <input
          type="file"
          hidden
          disabled={!owner || !online || uploading}
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </label>
      {form.qr_url && (
        <img src={form.qr_url} alt="QR de paiement" className="mp-qr-preview" />
      )}
      {owner && (
        <button className="mp-btn mp-btn-small" disabled={busy || !online}>
          {t.save}
        </button>
      )}
    </form>
  );
}
export default function MerchantPortal() {
  const [lang, setLang] = useState(
      localStorage.getItem("kp-merchant-language") === "en" ? "en" : "fr",
    ),
    [countries, setCountries] = useState([]),
    [resetAvailable, setResetAvailable] = useState(false),
    [phase, setPhase] = useState("loading"),
    [user, setUser] = useState(null),
    [merchant, setMerchant] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [pending, setPending] = useState(0),
    [syncing, setSyncing] = useState(false),
    [queueError, setQueueError] = useState(null);
  const syncLocked = useRef(false);
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    const previous = link.getAttribute('href');
    link.setAttribute('href', '/marchands.webmanifest');
    return () => link.setAttribute('href', previous || '/manifest.webmanifest');
  }, []);
  const invite = location.pathname.startsWith("/marchands/invite/")
    ? location.pathname.split("/")[3]
    : "";
  useEffect(() => {
    localStorage.setItem("kp-merchant-language", lang);
    document.documentElement.lang = lang;
  }, [lang]);
  const syncQueued = useCallback(async (authUser, orgId) => {
    const items = (await merchantQueue()).filter(
      (x) => x.user_id === authUser.id && x.org_id === orgId,
    );
    setPending(items.length);
    if (!items.length || !navigator.onLine || syncLocked.current) return;
    syncLocked.current = true;
    setQueueError(null);
    setSyncing(true);
    try {
      for (const entry of items) {
        try {
          await request(entry.path, {
            method: entry.method,
            merchant: orgId,
            body: entry.body,
          });
          await removeMerchantQueued(entry.id);
        } catch (error) {
          if (!error.network)
            setQueueError({ id: entry.id, message: error.message });
          break;
        }
      }
    } finally {
      setPending(
        (await merchantQueue()).filter(
          (x) => x.user_id === authUser.id && x.org_id === orgId,
        ).length,
      );
      setSyncing(false);
      syncLocked.current = false;
    }
  }, []);
  const load = useCallback(
    async (requestedInvite) => {
      const currentInvite =
        requestedInvite === undefined &&
        location.pathname.startsWith("/marchands/invite/")
          ? location.pathname.split("/")[3]
          : requestedInvite;
      setError("");
      try {
        const configuration = await request("/api/merchant/countries");
        setCountries(configuration.countries);
        setResetAvailable(configuration.reset_email_available);
        const session = await request("/api/m-auth/get-session");
        const authUser = session?.user;
        if (!authUser) {
          setPending(0);
          setPhase("auth");
          return;
        }
        setUser(authUser);
        if (currentInvite) {
          try {
            await request("/api/merchant/invitations/accept", {
              method: "POST",
              body: { token: currentInvite },
            });
          } catch (invitationError) {
            setError(invitationError.message);
            if (invitationError.status === 403) {
              setPhase("invitation");
              return;
            }
          }
          history.replaceState({}, "", "/marchands");
        }
        const list = await request("/api/merchant/memberships");
        if (!list.memberships?.length) {
          setPhase("register");
          return;
        }
        try {
          await syncQueued(authUser, list.memberships[0].org_id);
        } catch (storageError) {
          setQueueError({ id: null, message: storageError.message });
        }
        const data = await request("/api/merchant/dashboard", {
          merchant: list.memberships[0].org_id,
        });
        data.user = authUser;
        setMerchant(data);
        setPhase("dashboard");
      } catch (e) {
        setError(
          e.network
            ? localStorage.getItem("kp-merchant-language") === "en"
              ? "Offline. We will reconnect automatically."
              : "Hors ligne. Reconnexion automatique dès le retour du réseau."
            : e.message,
        );
        setPhase((current) =>
          e.network ? (current === "dashboard" ? current : "offline") : "auth",
        );
      }
    },
    [syncQueued],
  );
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const up = () => {
      setOnline(true);
      load("");
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [load]);
  const dropQueued = async () => {
    if (
      !queueError?.id ||
      !window.confirm(
        lang === "en"
          ? "Discard this unsynced change?"
          : "Abandonner cette modification non synchronisée ?",
      )
    )
      return;
    await removeMerchantQueued(queueError.id);
    setQueueError(null);
    await load("");
  };
  const signOut = async () => {
    if (!navigator.onLine) {
      setError(
        lang === "en"
          ? "Reconnect to sign out securely."
          : "Reconnectez-vous pour vous déconnecter en toute sécurité.",
      );
      return;
    }
    try {
      await request("/api/m-auth/sign-out", { method: "POST" });
    } catch (error) {
      setError(error.message);
      return;
    }
    setPending(0);
    setUser(null);
    setMerchant(null);
    setPhase("auth");
  };
  if (phase === "loading")
    return (
      <div className="mp-loading">
        <RefreshCw size={26} />
        {lang === "en" ? "Loading…" : "Chargement…"}
      </div>
    );
  if (location.pathname === "/marchands/reset") {
    const token = new URLSearchParams(location.search).get("token");
    return (
      <ResetForm token={token} lang={lang} setError={setError} error={error} />
    );
  }
  if (phase === "offline")
    return (
      <div className="merchant-v2 mp-simple">
        <section className="mp-panel">
          <WifiOff size={28} />
          <h1>{lang === "en" ? "Offline" : "Hors ligne"}</h1>
          <p>
            {lang === "en"
              ? "Reconnect to open your merchant space. Your pending changes will sync automatically."
              : "Reconnectez-vous pour ouvrir votre espace marchand. Vos modifications en attente seront synchronisées automatiquement."}
          </p>
        </section>
      </div>
    );
  if (phase === "invitation")
    return (
      <div className="merchant-v2 mp-simple">
        <section className="mp-panel">
          <h1>
            {lang === "en"
              ? "Invitation not accepted"
              : "Invitation non acceptée"}
          </h1>
          <ErrorBox error={error} />
          <button className="mp-btn mp-btn-primary" onClick={signOut}>
            {lang === "en"
              ? "Use another account"
              : "Se connecter avec un autre compte"}
          </button>
        </section>
      </div>
    );
  if (phase === "auth")
    return (
      <div className="merchant-v2">
        <div className="mp-language-top">
          <select
            aria-label="Langue"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="fr">FR</option>
            <option value="en">EN</option>
          </select>
        </div>
        <AuthView
          lang={lang}
          countries={countries}
          complete={load}
          error={error}
          setError={setError}
          resetAvailable={resetAvailable}
          invite={invite}
        />
      </div>
    );
  if (phase === "register")
    return (
      <div className="merchant-v2">
        <RegisterView
          lang={lang}
          countries={countries}
          user={user}
          onComplete={load}
          setError={setError}
          error={error}
        />
      </div>
    );
  return (
    <MerchantDashboard
      lang={lang}
      setLang={setLang}
      countries={countries}
      merchant={merchant}
      load={setMerchant}
      onSignOut={signOut}
      notice={notice}
      setNotice={setNotice}
      error={error}
      setError={setError}
      online={online}
      pending={pending}
      syncing={syncing}
      setPending={setPending}
      onSync={() => load("")}
      queueError={queueError}
      onDropQueued={dropQueued}
    />
  );
}
function ResetForm({ token, lang, error, setError }) {
  const [password, setPassword] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <div className="merchant-v2 mp-simple">
      <div className="mp-panel">
        <h1>{words[lang].reset}</h1>
        {done ? (
          <p className="mp-success">
            {lang === "en"
              ? "Password updated. Sign in now."
              : "Mot de passe modifié. Reconnectez-vous."}{" "}
            <a href="/marchands">{words[lang].login}</a>
          </p>
        ) : (
          <form
            className="mp-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              try {
                if (!token) throw new Error("Ce lien est invalide ou expiré.");
                await request("/api/m-auth/reset-password", {
                  method: "POST",
                  body: { token, newPassword: password },
                });
                setDone(true);
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label={lang === "en" ? "New password" : "Nouveau mot de passe"}
            >
              <input
                required
                type="password"
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorBox error={error} />
            <button className="mp-btn mp-btn-primary" disabled={busy}>
              {words[lang].reset}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ManualPaymentPage({ token }) {
  const [lang, setLang] = useState("fr"),
    [info, setInfo] = useState(null),
    [error, setError] = useState(""),
    [reference, setReference] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = (lang === "en" ? "Payment" : "Paiement") + " — KouturePro";
    const meta =
      document.querySelector('meta[name="robots"]') ||
      document.head.appendChild(document.createElement("meta"));
    meta.setAttribute("name", "robots");
    meta.setAttribute("content", "noindex,nofollow");
    return () => {
      meta.remove();
    };
  }, [lang]);
  useEffect(() => {
    request("/api/merchant/pay/" + token)
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [token]);
  const t = words[lang];
  return (
    <div className="merchant-v2 mp-pay-page">
      <header>
        <a className="mp-brand" href="/marchands">
          <span>
            <Store size={20} />
          </span>
          <strong>
            Kouture<span>Pro</span>
          </strong>
        </a>
        <select
          aria-label="Langue"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
        >
          <option value="fr">FR</option>
          <option value="en">EN</option>
        </select>
      </header>
      <main>
        {error ? (
          <div className="mp-panel">
            <h1>{lang === "en" ? "Link unavailable" : "Lien indisponible"}</h1>
            <ErrorBox error={error} />
          </div>
        ) : !info ? (
          <div className="mp-panel">
            <p>
              {lang === "en"
                ? "Loading payment information…"
                : "Chargement du paiement…"}
            </p>
          </div>
        ) : (
          <>
            <section className="mp-pay-hero">
              <span>{t.privacy}</span>
              <h1>{info.merchant}</h1>
              <p>{lang === "en" ? "Amount to pay" : "Montant à régler"}</p>
              <strong>
                {format(info.amount_minor, info.currency, info.decimals, lang)}
              </strong>
              <small>
                {t.expiry}{" "}
                {new Date(info.expires_at).toLocaleString(
                  lang === "en" ? "en-GB" : "fr-FR",
                )}
              </small>
            </section>
            {info.status === "review" && (
              <div className="mp-info" role="status">
                {lang === "en"
                  ? "To verify: the merchant must check your transaction reference before confirming payment."
                  : "À vérifier : le marchand doit contrôler votre référence avant de confirmer le paiement."}
              </div>
            )}
            {info.status === "pending" && (
              <section className="mp-panel mp-pay-methods">
                <h2>{t.step1}</h2>
                <div className="mp-method-grid">
                  {info.methods.map((m) => (
                    <div className="mp-public-method" key={m.code}>
                      <strong>{m.name}</strong>
                      {m.destination && (
                        <div>
                          {t.destination} : <b>{m.destination}</b>{" "}
                          <button
                            onClick={() =>
                              navigator.clipboard.writeText(m.destination)
                            }
                            aria-label="Copier le numéro"
                          >
                            <Copy size={15} />
                          </button>
                        </div>
                      )}
                      {m.bank_instructions && <p>{m.bank_instructions}</p>}
                      {m.qr_url && <img src={m.qr_url} alt={m.name + " QR"} />}
                    </div>
                  ))}
                </div>
                {!info.methods.length && (
                  <p>
                    {lang === "en"
                      ? "No payment method is active."
                      : "Aucun moyen de paiement actif."}
                  </p>
                )}
              </section>
            )}
            {info.status === "paid" ? (
              <section className="mp-panel">
                <p className="mp-success">
                  {lang === "en"
                    ? "Payment confirmed by the merchant."
                    : "Paiement confirmé par le marchand."}
                </p>
              </section>
            ) : info.status === "review" ? (
              <section className="mp-panel">
                <p className="mp-success">{t.claimDone}</p>
              </section>
            ) : (
              <section className="mp-panel">
                <h2>{t.step2}</h2>
                <p>
                  {lang === "en"
                    ? "Send the exact amount using the method shown above. We do not collect payments on this site."
                    : "Envoyez le montant exact avec l’un des moyens ci-dessus. Ce site ne prélève aucun paiement."}
                </p>
                <h2>{t.step3}</h2>
                {sent ? (
                  <p className="mp-success" role="status">
                    {t.claimDone}
                  </p>
                ) : (
                  <form
                    className="mp-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      setError("");
                      try {
                        await request("/api/merchant/pay/" + token + "/claim", {
                          method: "POST",
                          body: { reference },
                        });
                        setSent(true);
                        setInfo((previous) => ({
                          ...previous,
                          status: "review",
                        }));
                      } catch (err) {
                        setError(err.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Field label={t.reference}>
                      <input
                        required
                        minLength={2}
                        maxLength={120}
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        placeholder="WV-1234567"
                      />
                    </Field>
                    <ErrorBox error={error} />
                    <button className="mp-btn mp-btn-primary" disabled={busy}>
                      {t.claim}
                    </button>
                  </form>
                )}
                <p className="mp-disclaimer">
                  <ShieldCheck size={17} />
                  {t.privacy}
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
