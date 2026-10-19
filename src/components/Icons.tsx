import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  Copy,
  Plus,
  Reply,
  Image,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  MoreVertical,
  Pause,
  Phone,
  PhoneOff,
  Play,
  Search,
  Send,
  Settings,
  Smile,
  Trash2,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from 'lucide-react'

type IconProps = { className?: string }

function glyph(Icon: LucideIcon, className?: string) {
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />
}

export function GoogleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8A6.4 6.4 0 1 1 12 5.6c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.7 3.2 14.6 2.2 12 2.2 6.9 2.2 2.8 6.3 2.8 11.4S6.9 20.6 12 20.6c5.4 0 9-3.8 9-9.1 0-.6 0-1.1-.1-1.6H12z" />
    </svg>
  )
}

export function PhoneIcon({ className }: IconProps) {
  return glyph(Phone, className)
}

export function MicIcon({ className, off = false }: IconProps & { off?: boolean }) {
  return glyph(off ? MicOff : Mic, className)
}

export function EndIcon({ className }: IconProps) {
  return glyph(PhoneOff, className)
}

export function BackIcon({ className }: IconProps) {
  return glyph(ChevronLeft, className)
}

export function SearchIcon({ className }: IconProps) {
  return glyph(Search, className)
}

export function SendIcon({ className }: IconProps) {
  return glyph(Send, className)
}

export function ImageIcon({ className }: IconProps) {
  return glyph(Image, className)
}

export function SmileIcon({ className }: IconProps) {
  return glyph(Smile, className)
}

export function GearIcon({ className }: IconProps) {
  return glyph(Settings, className)
}

export function CloseIcon({ className }: IconProps) {
  return glyph(X, className)
}

export function TrashIcon({ className }: IconProps) {
  return glyph(Trash2, className)
}

export function CheckIcon({ className, double = false }: IconProps & { double?: boolean }) {
  return glyph(double ? CheckCheck : Check, className)
}

export function MoreIcon({ className }: IconProps) {
  return glyph(MoreVertical, className)
}

export function MoreHorizontalIcon({ className }: IconProps) {
  return glyph(MoreHorizontal, className)
}

export function VolumeIcon({ className, off = false }: IconProps & { off?: boolean }) {
  return glyph(off ? VolumeX : Volume2, className)
}

export function ChatsIcon({ className }: IconProps) {
  return glyph(MessageSquare, className)
}

export function SignOutIcon({ className }: IconProps) {
  return glyph(LogOut, className)
}

export function PlayIcon({ className }: IconProps) {
  return glyph(Play, className)
}

export function PauseIcon({ className }: IconProps) {
  return glyph(Pause, className)
}

export function CopyIcon({ className }: IconProps) {
  return glyph(Copy, className)
}

export function PlusIcon({ className }: IconProps) {
  return glyph(Plus, className)
}

export function ReplyIcon({ className }: IconProps) {
  return glyph(Reply, className)
}

export function DownIcon({ className }: IconProps) {
  return glyph(ChevronDown, className)
}
