-- User Story 1.4: Join Group Migration
-- Creates groups and group_members tables with stored procedure join_group()

-- 1. Groups Table
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive index on invite_code for fast lookups
CREATE INDEX IF NOT EXISTS idx_groups_invite_code_lower 
  ON public.groups (LOWER(invite_code));

-- 2. Group Members Table with unique constraint on (group_id, user_id)
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_group_user UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user 
  ON public.group_members (user_id);

-- 3. Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Allow reading groups
DROP POLICY IF EXISTS "Anyone can view groups" ON public.groups;
CREATE POLICY "Anyone can view groups"
  ON public.groups FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow reading members
DROP POLICY IF EXISTS "Anyone can view group members" ON public.group_members;
CREATE POLICY "Anyone can view group members"
  ON public.group_members FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4. Stored Procedure: POST /groups/join equivalent (join_group)
CREATE OR REPLACE FUNCTION public.join_group(
  p_invite_code TEXT,
  p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.groups%ROWTYPE;
  v_already_member BOOLEAN;
BEGIN
  -- Validate input
  IF p_invite_code IS NULL OR trim(p_invite_code) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'EMPTY_CODE',
      'message', 'Please enter an invite code'
    );
  END IF;

  -- 1. Case-insensitive lookup
  SELECT * INTO v_group
  FROM public.groups
  WHERE LOWER(invite_code) = LOWER(trim(p_invite_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_CODE',
      'message', 'No group found with that invite code'
    );
  END IF;

  -- 2. Check if user is already a member
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = v_group.id AND user_id = p_user_id
  ) INTO v_already_member;

  IF v_already_member THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'ALREADY_MEMBER',
      'group', jsonb_build_object(
        'id', v_group.id,
        'name', v_group.name,
        'invite_code', v_group.invite_code
      ),
      'message', 'You are already in this group'
    );
  END IF;

  -- 3. Add user to group
  INSERT INTO public.group_members (group_id, user_id)
  VALUES (v_group.id, p_user_id)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'JOINED',
    'group', jsonb_build_object(
      'id', v_group.id,
      'name', v_group.name,
      'invite_code', v_group.invite_code
    ),
    'message', format('Joined %s successfully', v_group.name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_group(TEXT, TEXT) TO anon, authenticated;

-- 5. Seed sample group for testing
INSERT INTO public.groups (id, name, invite_code)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Apartment 402', 'APT402')
ON CONFLICT (invite_code) DO NOTHING;
