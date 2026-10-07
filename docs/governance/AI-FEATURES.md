# AI features: model card, evaluation and limits

Owner: Nakul Jain · Last reviewed: 2026-10-08 · Update trigger: any AI provider, model, prompt or generated content entering the code or the data flow.
Agent-drafted 2026-10-08, not reviewed by a person.

## Finding: no AI runs in this application

A search of `app/`, `lib/`, `worker/`, `db/`, `components/` and `scripts/` for AI or language-model providers and calls (OpenAI, Anthropic, LLM, GPT, generative) found none. The only mentions of AI in code are in `scripts/deploy-cloudflare.mjs`, which **removes** any `SAHA_AI*` setting from its environment and checks none is present, and a comment in `scripts/demo.mjs` saying no paid AI service is used. There is no model, no prompt, no generated content, no training or fine-tuning, and no personal data sent to an AI provider. Therefore there is no model card or evaluation to publish: writing one would invent evidence.

## Gating (what keeps it off)

- Project rules: paid AI stays disabled and no provider is switched on ([CLAUDE.md](../../CLAUDE.md), [AGENTS.md](../../AGENTS.md), `HANDOVER.md`).
- Decision D-12 is open: AI provider, credentials and budget are unset, and "templates remain manually authored" ([DECISIONS-RISKS.md](../specification/DECISIONS-RISKS.md)).
- Requirement FR-23 (AI-assisted drafting) is "planned", not built; the integration matrix lists "AI provider -> resource workspace: None" ([INTEGRATION-CONTRACTS.md](../specification/INTEGRATION-CONTRACTS.md)).
- The Cloudflare deploy script strips `SAHA_OIDC`, `ORF`, `AI`, `MAIL` and `SMS` settings from its environment and checks none is present; the demo launcher drops `SAHA_OIDC_*` settings ([DEMO.md](../DEMO.md)).
- Teacher-facing "drafts" and curriculum "source-bound draft copies" are manually written text; the manual reading-practice planner copies reviewed observations into a provisional resource without calling any service.

## If AI is added later (checklist; nothing below is done)

1. Record the decision as a new ADR and update D-12; name provider, region, data sent, retention at the provider.
2. Complete a model card (intended use, model and version, inputs and outputs, known limits), an evaluation plan with measured results on synthetic then school-approved data, and bias and language coverage notes (English and Hindi at least).
3. Keep humans in the loop: AI proposes, a teacher reviews; no automated decisions about children, grades or attendance.
4. Never send student or guardian personal data to a provider without an approved data-processing basis; update the [DPIA](DPIA.md) and [record of processing](RECORD-OF-PROCESSING.md) first.
5. Add budget limits, failure behaviour and a switch-off path; add tests proving the feature is off by default.
