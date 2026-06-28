import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 갱신: API 라우트 포함 모든 경로에서 수행
  // 네트워크/서버 오류 시에도 미들웨어가 죽지 않도록 try/catch
  let user = null;
  let authCallFailed = false;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    // 네트워크/5xx 오류는 인증 실패가 아니라 일시적 장애로 간주
    if (result.error && isTransientAuthError(result.error)) {
      authCallFailed = true;
    }
  } catch {
    // Supabase 호출 자체가 실패 — 일시적 장애로 간주하고 통과시킴
    authCallFailed = true;
  }

  // API 라우트는 세션 갱신만 수행하고 리다이렉트하지 않음
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  // 인증 쿠키가 하나라도 있으면 잠재적 세션 존재 — 일시 오류로 강제 로그아웃하지 않음
  // (브라우저의 SessionGuard가 클라이언트에서 정확히 판단하고 복구 시도)
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  if (
    !user &&
    !authCallFailed &&
    !hasAuthCookie &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithSupabaseCookies(url, supabaseResponse);
  }

  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/workspace";
    return redirectWithSupabaseCookies(url, supabaseResponse);
  }

  return supabaseResponse;
}

function redirectWithSupabaseCookies(url: URL, supabaseResponse: NextResponse) {
  const response = NextResponse.redirect(url);

  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });

  return response;
}

/** 일시적 장애(네트워크/5xx)인지 — 인증 실패와 구분 */
function isTransientAuthError(error: { message?: string; status?: number }): boolean {
  const msg = error.message?.toLowerCase() ?? "";
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("timeout")) {
    return true;
  }
  if (error.status && error.status >= 500) return true;
  return false;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
