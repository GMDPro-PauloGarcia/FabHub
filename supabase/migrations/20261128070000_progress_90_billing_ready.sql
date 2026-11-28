-- 90 % → tell Finance it can bill (Paulo, 2026-11-28: "I just want a trigger
-- to billing that if a project reaches 90% then we can bill").
--
-- 90 % = installed, punchlist starts, progress billing up to 90 % of the
-- contract (migration 20261128060000). When set_project_progress takes a
-- project from below 90 % (or not set) to 90 % or more, the server sends the
-- Cost Control / Finance Telegram chat (`financialcontrol`, the same chat as
-- "Final Billing Ready") one message: project, CE, contract (VAT-ex) and what
-- has been invoiced so far (milestones past Draft, not Cancelled) with its
-- share of the contract. Skipped when 90 % or more is already invoiced (or
-- there is no contract value): nothing left to progress-bill. A notification only: nothing is invoiced or blocked,
-- and a Telegram failure never blocks the progress save.
--
-- Patched in place inside set_project_progress(uuid, int, jsonb) so the rest
-- of the function stays as applied (20261111190000 + 20261128060000).
-- Database only, no app change. Tested 2026-11-28 in a rolled-back transaction
-- with send_telegram stubbed: 60 % → no message; 90 % → one message; 100 %
-- after that → none; a project already 100 % invoiced → none.
-- Idempotent (skips if already patched).

do $$
declare v_def text := pg_get_functiondef('public.set_project_progress(uuid,integer,jsonb)'::regprocedure);
        v_anchor text := $a$    perform public.send_telegram('ops', left(v_msg, 4000), null);
  exception when others then
    null;
  end;
$a$;
        v_add text := $b$  -- 90 % reached: Finance can bill (20261128070000_progress_90_billing_ready)
  if coalesce(c.manual_progress, 0) < 90 and p_pct >= 90
     and coalesce((select sum(m.amount) from public.billing_milestones m
                    where m.deal_id = p_deal and coalesce(m.status, '') not in ('Draft', 'Cancelled')), 0)
         < 0.9 * coalesce((select value from public.deals where id = p_deal), 0) then
    begin
      v_msg := format(E'🧾 <b>Ready to bill: %s%% done</b>\n<b>%s</b>%s\nInstalled, punchlist started: progress billing up to 90%% of the contract can go out.\nContract (VAT-ex): ₱%s\nInvoiced so far: ₱%s (%s%%)\nBy: %s',
        p_pct,
        replace(replace(replace(coalesce(d.name, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
        case when coalesce(d.ce_no, '') <> '' then ' · ' || d.ce_no else '' end,
        to_char(coalesce((select value from public.deals where id = p_deal), 0), 'FM999,999,999,990.00'),
        to_char(coalesce((select sum(m.amount) from public.billing_milestones m
                           where m.deal_id = p_deal and coalesce(m.status, '') not in ('Draft', 'Cancelled')), 0), 'FM999,999,999,990.00'),
        coalesce(round(100 * (select sum(m.amount) from public.billing_milestones m
                               where m.deal_id = p_deal and coalesce(m.status, '') not in ('Draft', 'Cancelled'))
                       / nullif((select value from public.deals where id = p_deal), 0))::text, '0'),
        replace(replace(replace(v_by, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'));
      perform public.send_telegram('financialcontrol', left(v_msg, 4000), null);
    exception when others then
      null;
    end;
  end if;
$b$;
begin
  if position('20261128070000_progress_90_billing_ready' in v_def) > 0 then
    return;                                   -- already applied
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'set_project_progress is not the expected version; patch it by hand';
  end if;
  execute replace(v_def, v_anchor, v_anchor || v_add);
end $$;

-- ROLLBACK
-- Re-run the do-block with the replace reversed (remove v_add after v_anchor).
