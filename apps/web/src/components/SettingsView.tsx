"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { CATEGORY_ICONS, ACCOUNT_ICONS } from "@coincache/shared";
import type { PlainAccount, PlainCategory } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import {
  addUserAction,
  adminResetPasswordAction,
  changePasswordAction,
  logoutAction,
  saveAccountAction,
  saveCategoryAction,
  setAccountArchivedAction,
  setCategoryArchivedAction,
  updateSettingsAction,
  type ActionResult,
} from "@/lib/actions";
import ImportForm from "./ImportForm";

function Section(props: { title: string; children: React.ReactNode; subtitle?: string }) {
  return (
    <section className="px-4 pt-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-400">{props.title}</h2>
      {props.subtitle && <p className="mb-2 text-xs text-gray-400">{props.subtitle}</p>}
      <div className="rounded-xl bg-white p-3 shadow-sm">{props.children}</div>
    </section>
  );
}

function useCloseOnSuccess(state: ActionResult | null, close: () => void) {
  const closed = useRef(false);
  useEffect(() => {
    if (state?.ok && !closed.current) {
      closed.current = true;
      close();
    }
    if (state && !state.ok) closed.current = false;
  }, [state, close]);
}

function StatusLine({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p className="mt-2 text-sm text-income">Saved ✓</p>
  ) : (
    <p className="mt-2 text-sm text-red-600">{state.error}</p>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand";
const btnCls =
  "rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-60";

// ---------------------------------------------------------------- accounts

function AccountForm(props: { account: PlainAccount | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveAccountAction, null);
  useCloseOnSuccess(state, props.onDone);
  return (
    <form action={action} className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3">
      {props.account && <input type="hidden" name="id" value={props.account.id} />}
      <input name="name" placeholder="Account name" required defaultValue={props.account?.name} className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <select name="icon" defaultValue={props.account?.icon ?? "💵"} className={inputCls}>
          {ACCOUNT_ICONS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <input
          name="initialBalance"
          type="number"
          step="0.01"
          placeholder="Initial balance"
          defaultValue={props.account ? props.account.initialBalanceMinor / 100 : ""}
          className={inputCls}
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnCls}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={props.onDone} className="px-3 text-sm text-gray-500">
          Cancel
        </button>
      </div>
      {state && !state.ok && <StatusLine state={state} />}
    </form>
  );
}

function AccountsSection(props: { accounts: PlainAccount[]; currency: string; locale: string }) {
  const [editing, setEditing] = useState<string | null>(null); // account id or "new"
  return (
    <Section title="Accounts">
      <ul className="divide-y divide-gray-50">
        {props.accounts.map((a) => (
          <li key={a.id} className="py-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{a.icon}</span>
              <span className={`flex-1 text-sm font-medium ${a.archived ? "text-gray-400 line-through" : ""}`}>
                {a.name}
              </span>
              <span className="text-sm text-gray-500">{formatMoney(a.balanceMinor, props.currency, props.locale)}</span>
              <button onClick={() => setEditing(editing === a.id ? null : a.id)} className="px-2 text-sm text-brand-dark">
                Edit
              </button>
              <button
                onClick={() => setAccountArchivedAction(a.id, !a.archived)}
                className="px-1 text-sm text-gray-400"
                title={a.archived ? "Restore" : "Archive"}
              >
                {a.archived ? "♻️" : "🗄️"}
              </button>
            </div>
            {editing === a.id && <AccountForm account={a} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
      {editing === "new" ? (
        <AccountForm account={null} onDone={() => setEditing(null)} />
      ) : (
        <button onClick={() => setEditing("new")} className="mt-2 text-sm font-medium text-brand-dark">
          + Add account
        </button>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- categories

function CategoryForm(props: {
  category: PlainCategory | null;
  type: "EXPENSE" | "INCOME";
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveCategoryAction, null);
  useCloseOnSuccess(state, props.onDone);
  return (
    <form action={action} className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3">
      {props.category && <input type="hidden" name="id" value={props.category.id} />}
      <input type="hidden" name="type" value={props.type} />
      <input name="name" placeholder="Category name" required defaultValue={props.category?.name} className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <select name="icon" defaultValue={props.category?.icon ?? "📦"} className={inputCls}>
          {CATEGORY_ICONS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <input name="color" type="color" defaultValue={props.category?.color ?? "#9e9e9e"} className="h-10 w-full rounded-lg border border-gray-200" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnCls}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={props.onDone} className="px-3 text-sm text-gray-500">
          Cancel
        </button>
      </div>
      {state && !state.ok && <StatusLine state={state} />}
    </form>
  );
}

function CategoryGroup(props: { title: string; type: "EXPENSE" | "INCOME"; categories: PlainCategory[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const cats = props.categories.filter((c) => c.type === props.type);
  return (
    <div>
      <h3 className="mb-1 mt-2 text-xs font-semibold text-gray-400">{props.title}</h3>
      <ul className="divide-y divide-gray-50">
        {cats.map((c) => (
          <li key={c.id} className="py-1.5">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none"
                style={{ backgroundColor: c.color + "33" }}
              >
                {c.icon}
              </span>
              <span className={`flex-1 text-sm ${c.archived ? "text-gray-400 line-through" : ""}`}>{c.name}</span>
              <button onClick={() => setEditing(editing === c.id ? null : c.id)} className="px-2 text-sm text-brand-dark">
                Edit
              </button>
              <button
                onClick={() => setCategoryArchivedAction(c.id, !c.archived)}
                className="px-1 text-sm text-gray-400"
                title={c.archived ? "Restore" : "Archive"}
              >
                {c.archived ? "♻️" : "🗄️"}
              </button>
            </div>
            {editing === c.id && <CategoryForm category={c} type={props.type} onDone={() => setEditing(null)} />}
          </li>
        ))}
      </ul>
      {editing === "new" ? (
        <CategoryForm category={null} type={props.type} onDone={() => setEditing(null)} />
      ) : (
        <button onClick={() => setEditing("new")} className="mt-1 text-sm font-medium text-brand-dark">
          + Add
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- users & security

function AddUserForm() {
  const [state, action, pending] = useActionState(addUserAction, null);
  return (
    <form action={action} className="mt-3 space-y-2 border-t border-gray-100 pt-3">
      <p className="text-xs font-semibold text-gray-400">Add family member</p>
      <input name="name" placeholder="Name" required className={inputCls} autoComplete="off" />
      <input name="email" type="email" placeholder="Email" required className={inputCls} autoComplete="off" />
      <input name="password" type="password" placeholder="Temporary password (min 8 chars)" required className={inputCls} autoComplete="new-password" />
      <button type="submit" disabled={pending} className={btnCls}>
        {pending ? "Adding…" : "Add user"}
      </button>
      <StatusLine state={state} />
    </form>
  );
}

function ResetMemberPasswordForm(props: { userId: string; userName: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(adminResetPasswordAction, null);
  return (
    <form action={action} className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3">
      <input type="hidden" name="userId" value={props.userId} />
      <p className="text-xs text-gray-500">
        Set a new password for <strong>{props.userName}</strong>. Their other devices will be signed out.
      </p>
      <input
        name="password"
        type="password"
        placeholder="New password (min 8 chars)"
        required
        className={inputCls}
        autoComplete="new-password"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnCls}>
          {pending ? "Resetting…" : "Reset password"}
        </button>
        <button type="button" onClick={props.onDone} className="px-3 text-sm text-gray-500">
          Cancel
        </button>
      </div>
      <StatusLine state={state} />
    </form>
  );
}

function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="mt-3 space-y-2 border-t border-gray-100 pt-3">
      <p className="text-xs font-semibold text-gray-400">Change my password</p>
      <input name="current" type="password" placeholder="Current password" required className={inputCls} autoComplete="current-password" />
      <input name="next" type="password" placeholder="New password (min 8 chars)" required className={inputCls} autoComplete="new-password" />
      <button type="submit" disabled={pending} className={btnCls}>
        {pending ? "Updating…" : "Update password"}
      </button>
      <StatusLine state={state} />
      {state?.ok && <p className="text-xs text-gray-400">Other devices have been signed out.</p>}
    </form>
  );
}

function FamilyList(props: {
  users: { id: string; name: string; email: string; role: "ADMIN" | "MEMBER" }[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [resetting, setResetting] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-gray-50">
      {props.users.map((u) => (
        <li key={u.id} className="py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 font-semibold text-brand-dark">
              {u.name.charAt(0).toUpperCase()}
            </span>
            <div className="flex-1">
              <div className="font-medium">
                {u.name}
                {u.id === props.currentUserId && <span className="text-gray-400"> (you)</span>}
              </div>
              <div className="text-xs text-gray-400">{u.email}</div>
            </div>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {u.role.toLowerCase()}
            </span>
            {props.isAdmin && u.id !== props.currentUserId && (
              <button
                onClick={() => setResetting(resetting === u.id ? null : u.id)}
                className="px-1 text-xs font-medium text-brand-dark"
              >
                Reset password
              </button>
            )}
          </div>
          {resetting === u.id && (
            <ResetMemberPasswordForm userId={u.id} userName={u.name} onDone={() => setResetting(null)} />
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- preferences

function PreferencesForm(props: { currency: string; timezone: string }) {
  const [state, action, pending] = useActionState(updateSettingsAction, null);
  return (
    <form action={action} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Currency (ISO code)</span>
          <input name="currency" defaultValue={props.currency} maxLength={3} required className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Timezone</span>
          <input name="timezone" defaultValue={props.timezone} required className={inputCls} />
        </label>
      </div>
      <button type="submit" disabled={pending} className={btnCls}>
        {pending ? "Saving…" : "Save preferences"}
      </button>
      <StatusLine state={state} />
    </form>
  );
}

// ---------------------------------------------------------------- main view

export default function SettingsView(props: {
  accounts: PlainAccount[];
  categories: PlainCategory[];
  users: { id: string; name: string; email: string; role: "ADMIN" | "MEMBER" }[];
  currency: string;
  locale: string;
  timezone: string;
  isAdmin: boolean;
  currentUserId: string;
}) {
  return (
    <div>
      <AccountsSection accounts={props.accounts} currency={props.currency} locale={props.locale} />

      <Section title="Categories">
        <CategoryGroup title="Expenses" type="EXPENSE" categories={props.categories} />
        <CategoryGroup title="Income" type="INCOME" categories={props.categories} />
      </Section>

      <Section
        title="Data"
        subtitle="Import a CSV export from your old expense tracker, or download everything as CSV."
      >
        <ImportForm />
        <a
          href="/api/export"
          className="mt-3 inline-block rounded-lg border border-brand px-4 py-2 text-sm font-semibold text-brand-dark"
        >
          ⬇ Export all records (CSV)
        </a>
      </Section>

      <Section
        title="Family & security"
        subtitle="Every member has their own fully private space — accounts, categories, records and preferences are never shared."
      >
        <FamilyList
          users={props.users}
          currentUserId={props.currentUserId}
          isAdmin={props.isAdmin}
        />
        {props.isAdmin && <AddUserForm />}
        <ChangePasswordForm />
      </Section>

      <Section title="Preferences">
        <PreferencesForm currency={props.currency} timezone={props.timezone} />
      </Section>

      <Section title="Session">
        <form action={logoutAction}>
          <button className="flex h-11 w-full items-center justify-center rounded-lg border border-expense/40 text-sm font-semibold text-expense active:bg-red-50">
            Sign out
          </button>
        </form>
      </Section>
    </div>
  );
}
