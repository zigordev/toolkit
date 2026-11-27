'use client';

import { AppNav, type Place } from '@zigordev/ui';
import { usePathname } from 'next/navigation';
import { Link } from '../lib/link.ts';

export interface NavigationProps {
  readonly label: string;
  readonly places: readonly Place[];
}

function link(place: Place) {
  return <Link href={place.href} />;
}

export function Navigation({ label, places }: NavigationProps) {
  return <AppNav label={label} places={places} pathname={usePathname()} renderLink={link} />;
}
