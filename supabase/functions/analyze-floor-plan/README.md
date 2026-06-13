# analyze-floor-plan Edge Function

Accepts a base64-encoded floor plan image, calls Claude's vision API, and returns
extracted area + space breakdown for auto-filling the BOQ generator.

## Deploy

```bash
# 1. Install Supabase CLI (if not already)
npm install -g supabase

# 2. Login and link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# 3. Set the Claude API key as a secret
supabase secrets set CLAUDE_API_KEY=sk-ant-...

# 4. Deploy the function
supabase functions deploy analyze-floor-plan --no-verify-jwt
```

## Response shape

```json
{
  "totalArea": 120,
  "spaces": [
    { "name": "Dining Area", "area": 60 },
    { "name": "Kitchen", "area": 30 }
  ],
  "projectType": "fnb",
  "notes": "Open-plan F&B with separate kitchen and service counter."
}
```

## Cost estimate

Each scan uses Claude Opus 4.8 with vision — roughly ₱0.50–2.50 per floor plan
depending on image size and complexity.
