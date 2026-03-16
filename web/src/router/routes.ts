export const ROUTES = {
  ROOT: "/",
  ATTACHMENTS: "/attachments",
  INBOX: "/inbox",
  ARCHIVED: "/archived",
  SETTING: "/setting",
  EXPLORE: "/explore",
  MAP: "/map",
  AUTH: "/auth",
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];
