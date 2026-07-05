-- ── Migration 019: Pin search_path on next_wo_number() (security hardening) ──
-- The Supabase security linter (lint 0011_function_search_path_mutable) flagged
-- public.next_wo_number() for having a role-mutable search_path. A mutable
-- search_path lets a caller shadow built-in/table names with objects in a
-- schema they control, so a function resolving an unqualified name could be
-- steered to attacker-controlled code. next_wo_number is SECURITY INVOKER (low
-- risk) and only references the public subcon_work_orders table plus built-ins,
-- so pinning the path is behavior-preserving.
--
-- The two SECURITY DEFINER functions that actually matter here — verify_login
-- and next_doc_number — already had search_path set (migrations 017/prior), so
-- this closes the last function flagged by the linter.
--
-- Already applied to the live project via mcp__Supabase__apply_migration on
-- 2026-07-05; this file documents it for the repo/history.

alter function public.next_wo_number() set search_path = public, pg_temp;
