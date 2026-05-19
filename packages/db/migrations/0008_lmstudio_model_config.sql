-- Add per-user LM Studio model overrides to user_ai_settings
ALTER TABLE user_ai_settings ADD COLUMN IF NOT EXISTS lm_studio_chat_model text;
ALTER TABLE user_ai_settings ADD COLUMN IF NOT EXISTS lm_studio_mindmap_model text;
