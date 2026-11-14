import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith("/") ? params.next : "/observability";
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full border border-[#d8cfbf] bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a1f2d]">TASUKI KEIFU</p>
        <h1 className="mt-3 text-2xl font-semibold">数据治理观测 / Observability</h1>
        <p className="mt-3 text-sm text-[#59615c]">登录后查看治理运行和数据修复记录。</p>
        {params.error && <p className="mt-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">账号或密码不正确。</p>}
        <form className="mt-6 space-y-4" method="post" action="/api/auth/login">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm"><span className="mb-1 block">账号</span><input className="w-full border border-[#cfc7b8] px-3 py-2" name="username" autoComplete="username" required /></label>
          <label className="block text-sm"><span className="mb-1 block">密码</span><input className="w-full border border-[#cfc7b8] px-3 py-2" type="password" name="password" autoComplete="current-password" required /></label>
          <button className="w-full bg-[#8a1f2d] px-4 py-3 text-sm font-semibold text-white" type="submit">登录 / Sign in</button>
        </form>
        <Link className="mt-6 inline-block text-sm underline" href="/zh">返回数据站</Link>
      </section>
    </main>
  );
}
