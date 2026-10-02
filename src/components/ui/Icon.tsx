import type { ComponentProps } from 'react';
import {
    Plus, PlusCircle, Minus, X, Check, CheckCircle2, ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
    ArrowRight, ArrowLeftRight, Pencil, Trash2, Copy, Share, Share2, Link, Link2Off,
    Lock, LockOpen, Eye, EyeOff, Mail, MailCheck, User, Users, Star, ShieldCheck, ShoppingCart, ShoppingBag, Store,
    BadgeCheck, Tag, CircleHelp, Hourglass, Clock, Calculator, Camera, Image,
    Images, FileText, ReceiptText, RefreshCw, Key, ListFilter, ListChecks,
    Rows3, SlidersHorizontal, StickyNote, FolderInput, Euro, TriangleAlert, LogOut,
    Maximize2, Minimize2, Moon, Sun, Bell, BellOff, BellRing, Smartphone, Download, SquarePlus,
    Utensils, ShoppingBasket, Car, Home, Zap, Clapperboard, HeartPulse, Plane, PawPrint, MoreHorizontal,
    Scale, Activity, Send, Settings, ExternalLink, UserPlus, AtSign, CloudOff, Search, Info, CreditCard, ArrowDownLeft, ArrowUpRight,
    type LucideIcon,
} from 'lucide-react';

// Um só vocabulário de ícones (Lucide). A `name` é o antigo nome do Material
// Icons — a migração dos ~90 sítios foi só trocar <span className="material-icons">
// por <Icon />, mantendo a classe de tamanho (text-lg, text-[18px], …): o SVG
// usa `1em`, por isso escala com o font-size tal como a fonte fazia.

const MAP = {
    add: Plus,
    add_circle: PlusCircle,
    add_shopping_cart: ShoppingCart,
    remove: Minus,
    close: X,
    check: Check,
    done: Check,
    check_circle: CheckCircle2,
    chevron_right: ChevronRight,
    chevron_left: ChevronLeft,
    keyboard_arrow_down: ChevronDown,
    keyboard_arrow_up: ChevronUp,
    expand_more: ChevronDown,
    arrow_forward: ArrowRight,
    swap_horiz: ArrowLeftRight,
    edit: Pencil,
    delete_outline: Trash2,
    content_copy: Copy,
    share: Share2,
    // Ícone real do botão "Partilhar" do Safari/iOS (quadrado + seta para
    // cima) — distinto do `share` (Share2, o ícone de rede do Android).
    ios_share: Share,
    link: Link,
    link_off: Link2Off,
    lock: Lock,
    lock_open: LockOpen,
    visibility: Eye,
    visibility_off: EyeOff,
    mail: Mail,
    mark_email_read: MailCheck,
    person: User,
    group: Users,
    groups: Users,
    star: Star,
    admin_panel_settings: ShieldCheck,
    shopping_cart: ShoppingCart,
    shopping_bag: ShoppingBag,
    storefront: Store,
    verified: BadgeCheck,
    label: Tag,
    help_outline: CircleHelp,
    hourglass_empty: Hourglass,
    schedule: Clock,
    calculate: Calculator,
    camera: Camera,
    photo_camera: Camera,
    photo: Image,
    photo_library: Images,
    picture_as_pdf: FileText,
    receipt_long: ReceiptText,
    refresh: RefreshCw,
    cloud_off: CloudOff,
    key: Key,
    filter_list: ListFilter,
    search: Search,
    info: Info,
    credit_card: CreditCard,
    call_received: ArrowDownLeft,
    call_made: ArrowUpRight,
    checklist: ListChecks,
    view_agenda: Rows3,
    tune: SlidersHorizontal,
    sticky_note_2: StickyNote,
    drive_file_move: FolderInput,
    attach_money: Euro,
    warning: TriangleAlert,
    logout: LogOut,
    fullscreen: Maximize2,
    fullscreen_exit: Minimize2,
    dark_mode: Moon,
    light_mode: Sun,
    notifications: Bell,
    notifications_active: BellRing,
    notifications_off: BellOff,
    phone_iphone: Smartphone,
    install_mobile: Download,
    add_to_home_screen: SquarePlus,
    // Categorias de despesa (livro-razão) — ver src/lib/ledger/categories.ts.
    restaurant: Utensils,
    local_grocery_store: ShoppingBasket,
    directions_car: Car,
    home: Home,
    bolt: Zap,
    theaters: Clapperboard,
    medical_services: HeartPulse,
    flight: Plane,
    pets: PawPrint,
    more_horiz: MoreHorizontal,
    // Livro-razão — saldos e atividade.
    balance: Scale,
    activity: Activity,
    send: Send,
    settings: Settings,
    person_add: UserPlus,
    alternate_email: AtSign,
    open_in_new: ExternalLink,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof MAP;

interface IconProps extends Omit<ComponentProps<LucideIcon>, 'ref'> {
    name: IconName;
    /** px fixo. Por omissão herda o font-size (1em) — mantém as classes text-*. */
    size?: number | string;
    /** Rótulo acessível. Sem ele o ícone é aria-hidden (decorativo). */
    title?: string;
}

export function Icon({ name, size, title, className, strokeWidth = 2, ...rest }: IconProps) {
    const Cmp = MAP[name];
    if (!Cmp) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn(`[Icon] sem mapeamento para "${name}"`);
        }
        return null;
    }
    return (
        <Cmp
            size={size ?? '1em'}
            strokeWidth={strokeWidth}
            className={className}
            aria-hidden={title ? undefined : true}
            aria-label={title}
            role={title ? 'img' : undefined}
            {...rest}
        />
    );
}
