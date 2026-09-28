import ScanForm from "@/components/ScanForm";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-4xl font-semibold tracking-widest text-white sm:text-5xl">
        LINKGUARD
      </h1>
      <p className="mt-4 mb-10 max-w-md text-slate-400">
        Understand the security posture of a website.
      </p>

      <ScanForm />

      <p className="mt-12 max-w-md text-xs text-slate-500">
        LinkGuard reports observable security properties. It does not decide
        whether a website is &quot;safe.&quot;
      </p>
    </main>
  );
}