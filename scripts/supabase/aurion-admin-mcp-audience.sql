-- Install into the Supabase Auth database; this script provisions no clients,
-- users, roles or secrets. Configure an explicitly trusted client-to-resource
-- mapping separately. The hook is opt-in and is not activated by this script.
BEGIN;

CREATE SCHEMA aurion_admin_mcp_auth;
REVOKE ALL ON SCHEMA aurion_admin_mcp_auth FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA aurion_admin_mcp_auth TO supabase_auth_admin;

CREATE TABLE aurion_admin_mcp_auth.client_audiences (
  client_id uuid PRIMARY KEY,
  resource_url text NOT NULL CHECK (
    resource_url ~ '^https://[^[:space:]/?#]+/admin-mcp$'
    AND position('@' IN resource_url) = 0
  )
);
REVOKE ALL ON TABLE aurion_admin_mcp_auth.client_audiences FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE aurion_admin_mcp_auth.client_audiences TO supabase_auth_admin;

-- SECURITY INVOKER: only the Auth administrator can read the mapping and
-- call this hook. An unmapped client retains its original claims.
CREATE FUNCTION aurion_admin_mcp_auth.access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  claims jsonb := event->'claims';
  oauth_client text := claims->>'client_id';
  audience text;
BEGIN
  IF jsonb_typeof(claims) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Access-token hook requires a claims object';
  END IF;
  IF oauth_client ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT mapping.resource_url INTO audience
    FROM aurion_admin_mcp_auth.client_audiences AS mapping
    WHERE mapping.client_id = oauth_client::uuid;
    IF audience IS NOT NULL THEN
      claims := jsonb_set(claims, '{aud}', to_jsonb(audience));
    END IF;
  END IF;
  RETURN jsonb_build_object('claims', claims);
END;
$$;
REVOKE ALL ON FUNCTION aurion_admin_mcp_auth.access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION aurion_admin_mcp_auth.access_token_hook(jsonb) TO supabase_auth_admin;

COMMIT;
