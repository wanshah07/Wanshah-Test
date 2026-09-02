import { Download, Mail, Phone, Shield, User } from 'lucide-react';

import { BorderRotate } from '@/components/ui/animated-gradient-border';

// The upstream demo imported Star, Zap, Heart, Play and Settings without using
// them. This project runs tsc with noUnusedLocals, so the import list is
// trimmed to what is actually rendered.

function Default() {
  return <BorderRotate className="h-65 w-96" />;
}

function FastAnimation() {
  return (
    <BorderRotate
      animationSpeed={0.8}
      gradientColors={{
        primary: '#7f1d1d',
        secondary: '#dc2626',
        accent: '#f87171',
      }}
      backgroundColor="#410d0d"
      className="p-6"
    >
      <div className="space-y-4 text-center text-white">
        <div className="mb-4 flex justify-center">
          <Shield className="h-8 w-8 text-red-400" />
        </div>
        <h3 className="mb-2 text-xl font-semibold">Security First</h3>
        <p className="mb-4 text-gray-300">0.8s rotation speed with vivid red theme</p>
        <div className="grid grid-cols-2 gap-3">
          <button className="rounded-lg bg-red-600 px-3 py-2 text-sm transition-colors hover:bg-red-500">
            <Shield className="mr-1 inline h-4 w-4" />
            Secure
          </button>
          <button className="rounded-lg border border-red-400 px-3 py-2 text-sm transition-colors hover:border-red-300">
            <Download className="mr-1 inline h-4 w-4" />
            Download
          </button>
        </div>
      </div>
    </BorderRotate>
  );
}

function StopOnHover() {
  return (
    <BorderRotate
      animationMode="stop-rotate-on-hover"
      gradientColors={{
        primary: '#581c87',
        secondary: '#7c3aed',
        accent: '#a855f7',
      }}
      backgroundColor="#271832"
      className="p-6"
    >
      <div className="space-y-4 text-center text-white">
        <div className="mb-4 flex justify-center">
          <User className="h-8 w-8 text-purple-400" />
        </div>
        <h3 className="mb-2 text-xl font-semibold">User Profile</h3>
        <p className="mb-4 text-gray-300">Animation pauses on hover — purple theme</p>
        <div className="space-y-3">
          <div className="flex justify-center gap-2">
            <button className="rounded-lg bg-purple-600 px-3 py-2 transition-colors hover:bg-purple-500">
              <Mail className="mr-1 inline h-4 w-4" />
              Message
            </button>
            <button className="rounded-lg bg-purple-600 px-3 py-2 transition-colors hover:bg-purple-500">
              <Phone className="mr-1 inline h-4 w-4" />
              Call
            </button>
          </div>
          <div className="text-sm text-purple-300">Premium Member Since 2024</div>
        </div>
      </div>
    </BorderRotate>
  );
}

export { Default, FastAnimation, StopOnHover };
