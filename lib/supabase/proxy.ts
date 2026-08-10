import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/reset-password"];
const ALLOWED_WHEN_MUST_CHANGE_PASSWORD = ["/change-password"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  const isAllowedWhenMustChangePassword = ALLOWED_WHEN_MUST_CHANGE_PASSWORD.some(
    (path) => request.nextUrl.pathname.startsWith(path)
  );

  if (user && !isPublicPath && !isAllowedWhenMustChangePassword) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .single();

    if (profile?.must_change_password) {
      const changePasswordUrl = request.nextUrl.clone();
      changePasswordUrl.pathname = "/change-password";
      changePasswordUrl.search = "";
      return NextResponse.redirect(changePasswordUrl);
    }
  }

  return response;
}
