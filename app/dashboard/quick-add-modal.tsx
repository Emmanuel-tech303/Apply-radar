"use client";

import { useEffect, useRef, type FormEvent, type MouseEvent } from "react";
import { Check, NotebookPen, Plus, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { QuickApplicationSchema } from "@/lib/validation";
import { OPEN_QUICK_ADD_EVENT } from "./quick-add-trigger";

function setFeedback(node: HTMLOutputElement | null, text: string, success = false) {
  if (!node) return;
  node.textContent = text;
  node.className = success ? "quick-modal-feedback is-success" : "quick-modal-feedback";
}

export function QuickAddModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLOutputElement>(null);

  function clearFieldErrors() {
    const form = formRef.current;
    if (!form) return;
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[aria-invalid='true']").forEach((input) => {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    });
    form.querySelectorAll<HTMLOutputElement>(".field-error").forEach((output) => { output.textContent = ""; });
  }

  useEffect(() => {
    const open = () => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.open) return;
      setFeedback(feedbackRef.current, "");
      clearFieldErrors();
      dialog.showModal();
      dialog.querySelector<HTMLInputElement>("[name=companyName]")?.focus();
    };
    window.addEventListener(OPEN_QUICK_ADD_EVENT, open);
    return () => window.removeEventListener(OPEN_QUICK_ADD_EVENT, open);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    clearFieldErrors();
    const data = new FormData(form);
    const values = {
      companyName: String(data.get("companyName") ?? ""),
      jobRole: String(data.get("jobRole") ?? ""),
      notes: String(data.get("notes") ?? ""),
    };
    const validation = QuickApplicationSchema.safeParse(values);
    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      const field = firstIssue?.path[0] === "jobRole" ? "jobRole" : "companyName";
      const input = form.querySelector<HTMLInputElement>(`[name="${field}"]`);
      const output = form.querySelector<HTMLOutputElement>(`#quick-${field}-error`);
      input?.setAttribute("aria-invalid", "true");
      input?.setAttribute("aria-describedby", `quick-${field}-error`);
      if (output) output.textContent = firstIssue?.message ?? "Check this field and try again.";
      input?.focus();
      return;
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      setFeedback(feedbackRef.current, "Supabase is not connected. Add your project URL and public key, then reload.");
      return;
    }
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) {
      setFeedback(feedbackRef.current, "Sign in before adding an application.");
      return;
    }

    const submitButton = form.querySelector<HTMLButtonElement>("[type=submit]");
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = "Saving…"; }
    setFeedback(feedbackRef.current, "Saving your application…");
    const noteValue = validation.data.notes?.trim() ?? "";
    const jobUrl = /^https?:\/\/\S+$/i.test(noteValue) ? noteValue : null;
    const result = await client.from("applications").insert({
      user_id: auth.user.id,
      company_name: validation.data.companyName,
      job_role: validation.data.jobRole,
      source: "manual",
      status: "applied",
      job_url: jobUrl,
      user_notes: noteValue && !jobUrl ? noteValue : null,
      last_updated_at: new Date().toISOString(),
      prep_resources: [],
    }).select("id").single();

    if (result.error) {
      setFeedback(feedbackRef.current, "Could not save the application. Confirm the application editing migration is applied in Supabase.");
      if (submitButton) { submitButton.disabled = false; submitButton.textContent = "Add to radar"; }
      return;
    }
    form.reset();
    setFeedback(feedbackRef.current, "Application added. Your follow-up is set for 14 days from now.", true);
    window.dispatchEvent(new Event("applyradar:application-added"));
    window.setTimeout(() => dialogRef.current?.close(), 1400);
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) event.currentTarget.close();
  }

  return (
    <dialog ref={dialogRef} className="quick-add-dialog" aria-labelledby="quick-add-title" onClick={closeFromBackdrop}>
      <form ref={formRef} className="quick-add-modal" noValidate onSubmit={(event) => void submit(event)}>
        <div className="quick-add-modal-heading"><div><span className="quick-add-modal-icon"><NotebookPen size={18}/></span><div><span className="eyebrow">QUICK CAPTURE</span><h2 id="quick-add-title">Add an application</h2></div></div><button className="quick-modal-close" type="button" aria-label="Close quick add" onClick={() => dialogRef.current?.close()}><X size={17}/></button></div>
        <p className="quick-add-modal-intro">Save the essentials now. You can update the details and status whenever you need.</p>
        <div className="form-field"><label htmlFor="quick-company">Company name <span className="required">*</span></label><input id="quick-company" name="companyName" required maxLength={100} aria-describedby="quick-company-error" placeholder="e.g. Acme Studio"/><output id="quick-company-error" className="field-error"/></div>
        <div className="form-field"><label htmlFor="quick-role">Job title <span className="required">*</span></label><input id="quick-role" name="jobRole" required maxLength={120} aria-describedby="quick-jobRole-error" placeholder="e.g. Registered Nurse, Account Manager"/><output id="quick-jobRole-error" className="field-error"/></div>
        <div className="form-field"><label htmlFor="quick-notes">Job link or notes <span className="optional">OPTIONAL</span></label><textarea id="quick-notes" name="notes" maxLength={1500} placeholder="Paste the job link or a note for later…"/><span className="form-hint">You can edit these details from Applications.</span></div>
        <div className="quick-footnote"><span className="quick-check"><Check size={12}/></span><span>We’ll schedule a follow-up reminder for 14 days from today.</span></div>
        <output ref={feedbackRef} className="quick-modal-feedback" aria-live="polite"/>
        <div className="record-modal-actions"><button className="secondary-button" type="button" onClick={() => dialogRef.current?.close()}>Cancel</button><button className="primary-button" type="submit"><Plus size={15}/> Add to radar</button></div>
      </form>
    </dialog>
  );
}
