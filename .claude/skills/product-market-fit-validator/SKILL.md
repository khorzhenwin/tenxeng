---
name: product-market-fit-validator
description: Validate whether a proposed or shipped feature fits the product, solves a meaningful user problem, and stays differentiated from existing surfaces. Use when reviewing overlap between features, checking product market fit, challenging roadmap ideas, evaluating retention or adoption risk, or pressure-testing new UX against the current product.
---

# Product Market Fit Validator

## When To Use

Use this skill when you need to:
- Validate whether a new feature deserves to exist in this product
- Check if a feature overlaps too much with an existing one
- Pressure-test product positioning before or after implementation
- Identify adoption, retention, or differentiation risks
- Recommend whether to keep, merge, rename, narrow, or remove a feature

## Default Workflow

1. Inspect the current product surfaces in `README.md`, relevant product docs, and the main dashboard entry points.
2. State the user job for the feature being reviewed in one sentence.
3. Compare that user job against nearby existing features and identify overlap.
4. Decide whether the feature should be kept, repositioned, narrowed, merged, or removed.
5. Recommend the minimum changes needed to make the product clearer.
6. If the feature remains viable, update product docs and UX copy so the distinction is explicit.

## Evaluation Questions

- What user problem does this feature solve that is not already solved elsewhere?
- Why would a user open this surface instead of an adjacent one?
- Is the difference visible from labels, entry points, and first-screen copy?
- Does this feature strengthen the core loop or fragment it?
- Does the product need a new surface, or only a better action within an existing one?
- What would confuse a first-time user?

## Output Format

1. `Confusion points`
2. `Recommended positioning`
3. `Minimum product changes`
4. `Residual risks`

## Repo-Specific Guidance

- Core product shell lives in `app/dashboard/page.tsx`.
- Product feature packets live in `docs/product/`.
- Use `README.md` to understand the full shipped capability set before proposing a new surface.
