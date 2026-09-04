"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LogOut,
  Map,
  MapPin,
  Menu,
  Receipt,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getMe, logout, type AuthUser } from "@/lib/api-client";
import { isAdminPanelRole } from "@evcharge/shared";
import { initials, roleLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useQuery } from "@/hooks/use-query";

const NAV = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/dashboard/map", label: "Mapa da rede", icon: Map },
  { href: "/dashboard/operations", label: "Operação ao vivo", icon: Zap },
  { href: "/dashboard/stations", label: "Estações", icon: MapPin },
  { href: "/dashboard/tariffs", label: "Tarifas", icon: Wallet },
  { href: "/dashboard/team", label: "Equipe", icon: Users },
  { href: "/dashboard/payments", label: "Transações demo", icon: Receipt },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname.startsWith(href);
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Zap className="size-4" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight">EV Charge</span>
        <span className="block text-[11px] text-muted-foreground">Painel beta</span>
      </span>
    </Link>
  );
}

function UserMenu({ user }: { user: AuthUser }) {
  const router = useRouter();
  const name = user.profile?.fullName ?? user.email;
  const company = user.companies[0]?.name;

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-2 px-2 py-2">
          <Avatar className="size-8">
            <AvatarFallback className="bg-secondary text-xs">{initials(user.profile?.fullName, user.email)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{company ?? roleLabel(user.role)}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({
  user,
  pathname,
  onNavigate,
}: {
  user: AuthUser;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-6 py-4">
      <Brand />
      <NavLinks pathname={pathname} onNavigate={onNavigate} />
      <div className="mt-auto space-y-3 px-1">
        <Separator />
        <UserMenu user={user} />
      </div>
    </div>
  );
}

const AuthContext = createContext<AuthUser | null>(null);

export function useAuth() {
  const user = useContext(AuthContext);
  if (!user) throw new Error("useAuth must be used within AppShell");
  return user;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: user, error, loading } = useQuery(getMe, []);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">Carregando painel…</div>;
  }

  if (error || !user) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-muted-foreground">{error || "Sessão inválida"}</p>
        <Button onClick={handleLogout}>Ir para o login</Button>
      </div>
    );
  }

  if (!isAdminPanelRole(user.role)) {
    void handleLogout();
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Redirecionando…
      </div>
    );
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar px-3 lg:block">
        <SidebarBody user={user} pathname={pathname} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3 lg:hidden">
          <Brand />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-sidebar px-3">
              <SheetHeader className="sr-only">
                <SheetTitle>Navegação</SheetTitle>
              </SheetHeader>
              <SidebarBody user={user} pathname={pathname} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <AuthContext.Provider value={user}>{children}</AuthContext.Provider>
        </main>
      </div>
    </div>
  );
}
