"use client";

import Image from "next/image";
import { LockKeyhole, UserRound } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendLog } from "@/lib/log-client";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const normalizedLoginId = loginId.trim();
    if (!normalizedLoginId || !password) {
      setError("로그인 ID와 비밀번호를 입력해 주세요.");
      setLoading(false);
      return;
    }

    const authDomain = process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN || "example.com";
    const fallbackEmail = normalizedLoginId.includes("@")
      ? normalizedLoginId
      : `${normalizedLoginId}@${authDomain}`;

    let email = fallbackEmail;

    try {
      const precheckRes = await fetch("/api/employees/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "precheck",
          login_id: normalizedLoginId,
        }),
      });

      const precheck = await precheckRes.json();
      if (!precheckRes.ok) {
        throw new Error(precheck.error || "Login precheck failed.");
      }

      if (precheck.allowed === false) {
        setError(precheck.message || "비활성 계정입니다. 관리자에게 문의해 주세요.");
        sendLog("LOGIN_BLOCKED", `Blocked login attempt for inactive account: ${normalizedLoginId}`, {
          level: "ERROR",
        });
        setLoading(false);
        return;
      }

      if (typeof precheck.email === "string" && precheck.email) {
        email = precheck.email;
      }
    } catch {
      email = fallbackEmail;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      let message = "로그인 ID 또는 비밀번호가 올바르지 않습니다.";

      try {
        const failureRes = await fetch("/api/employees/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "failure",
            login_id: normalizedLoginId,
            reason: signInError.message,
          }),
        });

        const failureData = await failureRes.json();
        if (failureRes.ok) {
          if (failureData?.blocked) {
            message = failureData?.message || "로그인 실패 횟수 초과로 계정이 비활성화되었습니다.";
          } else if (typeof failureData?.remaining_attempts === "number") {
            message = `로그인 정보가 올바르지 않습니다. (${failureData.remaining_attempts}회 남음)`;
          }
        }
      } catch {
        // ignore
      }

      setError(message);
      sendLog("LOGIN_FAILED", `Login failed: ${normalizedLoginId}`, { level: "ERROR" });
      setLoading(false);
      return;
    }

    try {
      await fetch("/api/employees/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "success",
          login_id: normalizedLoginId,
        }),
      });
    } catch {
      // ignore
    }

    if (rememberMe) {
      localStorage.setItem("rememberMe", "true");
    } else {
      localStorage.removeItem("rememberMe");
    }

    router.push("/dashboard/workspace");
    sendLog("LOGIN", "Login succeeded");
    router.refresh();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(13,105,106,0.12),_transparent_32%),radial-gradient(circle_at_bottom,_rgba(180,131,83,0.14),_transparent_28%)]" />

      <Card className="relative z-10 w-full max-w-md border-none py-0 shadow-[0_28px_80px_-42px_rgba(13,77,77,0.32)]">
        <CardContent className="p-8 sm:p-10">
          <div className="space-y-8">
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-[1.75rem] border border-primary/10 bg-white/85 shadow-[0_24px_40px_-26px_rgba(13,105,106,0.45)]">
                <Image
                  src="/logo.png"
                  alt="김비서 로고"
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-[1.25rem] object-cover"
                />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">로그인</h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  사내 로그인 ID와 비밀번호를 입력해 업무 공간에 접속하세요.
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="loginId">로그인 ID</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="loginId"
                    name="loginId"
                    type="text"
                    placeholder="예: kim.manager"
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value)}
                    autoFocus
                    autoComplete="username"
                    className="h-11 pl-10"
                    disabled={loading}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">이메일이 아니라 사내 로그인 ID만 입력하면 됩니다.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="비밀번호를 입력해 주세요"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    className="h-11 pl-10"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/35 px-4 py-3">
                <Label htmlFor="rememberMe" className="text-sm font-medium">
                  로그인 상태 유지
                </Label>
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                  disabled={loading}
                />
              </div>

              {error ? (
                <div className="rounded-2xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={loading}>
                {loading ? "로그인 중..." : "로그인"}
              </Button>
            </form>

          </div>
        </CardContent>
      </Card>
    </div>
  );
}
