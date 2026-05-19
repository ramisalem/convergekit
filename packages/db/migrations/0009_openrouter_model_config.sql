-- Add per-user OpenRouter model overrides to user_ai_settings
ALTER TABLE user_ai_settings ADD COLUMN IF NOT EXISTS openrouter_chat_model text;
ALTER TABLE user_ai_settings ADD COLUMN IF NOT EXISTS openrouter_mindmap_model text;
