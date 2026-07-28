"use client";
import type { ButtonHTMLAttributes, HTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) { return <main className="dna-shell">{children}</main>; }
export function PageContainer({ children, className="" }: { children: ReactNode; className?: string }) { return <section className={`page-container ${className}`}>{children}</section>; }
export function StepHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: ReactNode }) { return <header className="step-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description ? <p>{description}</p> : null}</header>; }
function buttonClass(kind: string, className?: string) { return `button button-${kind} ${className ?? ""}`; }
export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`dna-primary ${buttonClass("primary", props.className)}`} />; }
export function SecondaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={buttonClass("secondary", props.className)} />; }
export function GhostButton(props: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={buttonClass("ghost", props.className)} />; }
export function ProgressIndicator({ step, label }: { step: number; label: string }) { return <div className="dna-progress" aria-label={`目前步驟：${label}`}><span>{label}</span><div><i style={{ width: `${Math.max(4, step * 10)}%` }} /></div></div>; }
interface ActionConfig {
  label: string;
  onClick(): void;
  disabled?: boolean;
}
interface ContextualAction extends ActionConfig { description: string; }
export function BottomActionBar({ children, primaryAction, secondaryAction, contextualAction, layout="split" }: { children?: ReactNode; primaryAction?: ActionConfig; secondaryAction?: ActionConfig; contextualAction?: ContextualAction; layout?: "split"|"stack" }) {
  return <div className={`dna-actions layout-${layout}`}>
    {contextualAction ? <div className="contextual-action"><span><strong>{contextualAction.description}</strong><small>{contextualAction.disabled ? contextualAction.label : "可立即查看並排比較"}</small></span><button type="button" disabled={contextualAction.disabled} onClick={contextualAction.onClick}>{contextualAction.label}</button></div> : null}
    <div className="action-row">{children ?? <>{secondaryAction ? <SecondaryButton type="button" disabled={secondaryAction.disabled} onClick={secondaryAction.onClick}>{secondaryAction.label}</SecondaryButton> : <span aria-hidden="true" />}{primaryAction ? <PrimaryButton type="button" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>{primaryAction.label}</PrimaryButton> : null}</>}</div>
  </div>;
}
export const BottomActions = BottomActionBar;
export function SectionCard({ children, className="", ...props }: HTMLAttributes<HTMLElement>) { return <section {...props} className={`section-card ${className}`}>{children}</section>; }
export function FormField({ children, className="", ...props }: LabelHTMLAttributes<HTMLLabelElement>) { return <label {...props} className={`form-field ${className}`}>{children}</label>; }
export function ErrorMessage({ children }: { children: ReactNode }) { return <p className="field-error" role="alert"><span>!</span>{children}</p>; }
export function ErrorState({ message, action }: { message: string; action?: ReactNode }) { return <div className="dna-error" role="alert"><strong>這一步暫時無法完成</strong><p>{message}</p>{action}</div>; }
export function LoadingState({ children="正在準備專屬體驗…" }: { children?: ReactNode }) { return <div className="loading-state" role="status"><i />{children}</div>; }
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty-state"><strong>{title}</strong>{children}</div>; }
