import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type MobileBottomNavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  match?: (pathname: string) => boolean;
};

type MobileBottomNavProps = {
  items: MobileBottomNavItem[];
  ariaLabel?: string;
};

function isPathActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function MobileBottomNav({ items, ariaLabel = 'Main navigation' }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="mobile-bottom-nav" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.match ? item.match(location.pathname) : isPathActive(location.pathname, item.to);

        return (
          <button
            key={item.to}
            type="button"
            className={active ? 'mobile-bottom-nav__item is-active' : 'mobile-bottom-nav__item'}
            onClick={() => navigate(item.to)}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
          >
            <span className="mobile-bottom-nav__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="mobile-bottom-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}