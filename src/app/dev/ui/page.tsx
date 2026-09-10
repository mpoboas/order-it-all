'use client';

// Workbench dos primitivos — só em desenvolvimento. Não está ligada a nada;
// abre /dev/ui à mão. Cada primitivo aqui em todos os estados, claro e escuro.
//
// Nota Tailwind: as classes têm de aparecer literais (o scanner não resolve
// `bg-${x}`), por isso os exemplos abaixo estão escritos por extenso.

import { useState } from 'react';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/context/ThemeContext';

const ICON_SAMPLE: IconName[] = [
    'add', 'close', 'check', 'edit', 'delete_outline', 'chevron_right',
    'keyboard_arrow_down', 'lock', 'lock_open', 'person', 'groups', 'star',
    'receipt_long', 'attach_money', 'share', 'refresh', 'filter_list', 'tune',
    'hourglass_empty', 'warning', 'verified', 'storefront',
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="border-t border-hairline pt-6">
            <h2 className="mb-4 font-mono text-xs uppercase tracking-[0.15em] text-ink-faint">
                {title}
            </h2>
            {children}
        </section>
    );
}

function Swatch({ box, label }: { box: string; label: string }) {
    return (
        <div className="rounded-xl border border-hairline p-3">
            <div className={`h-12 rounded-lg border border-hairline ${box}`} />
            <p className="mt-2 font-mono text-xs text-ink-soft">{label}</p>
        </div>
    );
}

export default function DevUiPage() {
    if (process.env.NODE_ENV === 'production') notFound();

    const { theme, toggleTheme } = useTheme();
    const [loading, setLoading] = useState(false);

    return (
        <div className="min-h-screen bg-app text-ink">
            <div className="mx-auto max-w-3xl px-5 py-10">
                <header className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Primitivos</h1>
                        <p className="text-sm text-ink-soft">Fase 1 · núcleo visual</p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={toggleTheme}>
                        Tema: {theme}
                    </Button>
                </header>

                <div className="flex flex-col gap-10">
                    <Section title="Cor · superfícies">
                        <div className="grid grid-cols-3 gap-3">
                            <Swatch box="bg-app" label="app" />
                            <Swatch box="bg-surface" label="surface" />
                            <Swatch box="bg-surface-sunken" label="surface-sunken" />
                        </div>
                    </Section>

                    <Section title="Cor · texto">
                        <p className="text-ink">text-ink — O rápido cão castanho.</p>
                        <p className="text-ink-soft">text-ink-soft — O rápido cão castanho.</p>
                        <p className="text-ink-faint">text-ink-faint — O rápido cão castanho.</p>
                    </Section>

                    <Section title="Cor · estado (par fg/bg)">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-xl bg-success-bg p-3 text-success-fg">
                                <p className="text-sm font-semibold">success</p>
                                <p className="font-mono text-[10px] opacity-80">feito</p>
                            </div>
                            <div className="rounded-xl bg-warning-bg p-3 text-warning-fg">
                                <p className="text-sm font-semibold">warning</p>
                                <p className="font-mono text-[10px] opacity-80">à espera</p>
                            </div>
                            <div className="rounded-xl bg-danger-bg p-3 text-danger-fg">
                                <p className="text-sm font-semibold">danger</p>
                                <p className="font-mono text-[10px] opacity-80">não deu</p>
                            </div>
                            <div className="rounded-xl bg-info-bg p-3 text-info-fg">
                                <p className="text-sm font-semibold">info</p>
                                <p className="font-mono text-[10px] opacity-80">neutro</p>
                            </div>
                        </div>
                    </Section>

                    <Section title="Escala de tipo">
                        <div className="flex flex-col gap-2">
                            <p className="text-xs">xs — Divisão de despesas</p>
                            <p className="text-sm">sm — Divisão de despesas</p>
                            <p className="text-base">base — Divisão de despesas</p>
                            <p className="text-lg">lg — Divisão de despesas</p>
                            <p className="text-xl">xl — Divisão de despesas</p>
                            <p className="text-2xl">2xl — Divisão de despesas</p>
                            <p className="text-3xl">3xl — Divisão de despesas</p>
                        </div>
                    </Section>

                    <Section title="Icon · Lucide, um só vocabulário (herda o font-size)">
                        <div className="flex items-center gap-4 text-ink-soft">
                            <Icon name="star" className="text-sm" />
                            <Icon name="star" className="text-lg" />
                            <Icon name="star" className="text-2xl" />
                            <Icon name="star" className="text-4xl" />
                            <span className="text-sm text-ink-faint">text-sm → text-4xl</span>
                        </div>
                        <div className="mt-4 grid grid-cols-8 gap-3 text-ink-soft sm:grid-cols-11">
                            {ICON_SAMPLE.map((n) => (
                                <div key={n} className="flex flex-col items-center gap-1" title={n}>
                                    <Icon name={n} className="text-2xl" />
                                    <span className="truncate font-mono text-[9px] text-ink-faint">{n}</span>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section title="Button · variantes">
                        <div className="flex flex-wrap gap-3">
                            <Button variant="primary">primary</Button>
                            <Button variant="secondary">secondary</Button>
                            <Button variant="danger">danger</Button>
                            <Button variant="warning">warning</Button>
                            <Button variant="ghost">ghost</Button>
                        </div>
                    </Section>

                    <Section title="Button · tamanhos + estados">
                        <div className="flex flex-wrap items-center gap-3">
                            <Button size="sm">sm</Button>
                            <Button size="md">md</Button>
                            <Button size="lg">lg</Button>
                            <Button disabled>disabled</Button>
                            <Button
                                loading={loading}
                                onClick={() => {
                                    setLoading(true);
                                    setTimeout(() => setLoading(false), 1500);
                                }}
                            >
                                {loading ? 'a carregar' : 'clica p/ loading'}
                            </Button>
                        </div>
                        <div className="mt-3">
                            <Button block>largura total (block)</Button>
                        </div>
                    </Section>

                    <Section title="Badge · tons e estados do domínio">
                        <div className="flex flex-wrap gap-2">
                            <Badge variant="success">success</Badge>
                            <Badge variant="warning">warning</Badge>
                            <Badge variant="danger">danger</Badge>
                            <Badge variant="info">info</Badge>
                            <Badge variant="neutral">neutral</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant="pending">Por comprar</Badge>
                            <Badge variant="found">Comprado</Badge>
                            <Badge variant="not_available">Não tinha</Badge>
                            <Badge variant="open">Aberta</Badge>
                            <Badge variant="closed">Fechada</Badge>
                        </div>
                    </Section>

                    <Section title="Card">
                        <Card className="max-w-sm">
                            <CardHeader>
                                <h3 className="font-bold">Pedido 21</h3>
                                <p className="text-sm text-ink-soft">Por Amiltão · 1 item</p>
                            </CardHeader>
                            <CardBody>
                                <p className="text-sm text-ink-soft">
                                    O Card agora usa tokens — funciona em claro e escuro.
                                </p>
                            </CardBody>
                            <CardFooter>
                                <Badge variant="pending">Por comprar</Badge>
                            </CardFooter>
                        </Card>
                    </Section>
                </div>
            </div>
        </div>
    );
}
