import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Buddies OS</h1>
        <Link href="/login" className="text-sm text-blue-600 hover:underline">
          Go to /login
        </Link>
      </div>
    </main>
  );
}
