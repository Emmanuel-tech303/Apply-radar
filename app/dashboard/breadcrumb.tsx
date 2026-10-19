import Link from "next/link";

export function DashboardBreadcrumb({ current }: { current: string }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link href="/dashboard">Dashboard</Link>
      <span aria-hidden="true">/</span>
      <strong aria-current="page">{current}</strong>
    </nav>
  );
}

export function HomeBreadcrumb({ current }: { current: string }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link href="/">Home</Link>
      <span aria-hidden="true">/</span>
      <strong aria-current="page">{current}</strong>
    </nav>
  );
}
