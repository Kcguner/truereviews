/** Mahalle dükkanları + defter illüstrasyonu (orijinal tasarımdan). */
export default function ShopIllo() {
  return (
    <svg className="illo" viewBox="0 0 520 380" role="img" aria-hidden="true">
      <defs>
        <filter id="gr">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <clipPath id="aw1">
          <rect x="40" y="112" width="128" height="26" />
        </clipPath>
        <clipPath id="aw2">
          <rect x="186" y="88" width="128" height="26" />
        </clipPath>
        <clipPath id="aw3">
          <rect x="332" y="126" width="128" height="26" />
        </clipPath>
      </defs>

      <circle cx="260" cy="176" r="152" fill="#17463C" opacity=".07" />
      <path d="M40 236h420" stroke="#1F1C17" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />

      <rect x="48" y="138" width="112" height="98" fill="#FCF8EF" stroke="#1F1C17" strokeWidth="2.4" />
      <rect x="66" y="164" width="34" height="40" fill="#DEE9E2" stroke="#1F1C17" strokeWidth="2" />
      <rect x="110" y="164" width="34" height="40" fill="#DEE9E2" stroke="#1F1C17" strokeWidth="2" />
      <rect x="40" y="112" width="128" height="26" fill="#AC452F" />
      <g clipPath="url(#aw1)">
        <rect x="56" y="112" width="16" height="26" fill="#FCF8EF" />
        <rect x="88" y="112" width="16" height="26" fill="#FCF8EF" />
        <rect x="120" y="112" width="16" height="26" fill="#FCF8EF" />
        <rect x="152" y="112" width="16" height="26" fill="#FCF8EF" />
      </g>
      <rect x="40" y="112" width="128" height="26" fill="none" stroke="#1F1C17" strokeWidth="2.4" />
      <path
        d="M40,138 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0"
        fill="#AC452F"
        stroke="#1F1C17"
        strokeWidth="2.2"
      />
      <rect x="30" y="150" width="10" height="86" rx="5" fill="#FCF8EF" stroke="#1F1C17" strokeWidth="2.2" />
      <path
        d="M30 160h10M30 172h10M30 184h10M30 196h10M30 208h10M30 220h10"
        stroke="#AC452F"
        strokeWidth="3"
      />

      <rect x="194" y="114" width="112" height="122" fill="#F5E3B8" stroke="#1F1C17" strokeWidth="2.4" />
      <rect x="210" y="140" width="80" height="46" fill="#FCF8EF" stroke="#1F1C17" strokeWidth="2" />
      <path d="M250 140v46M210 163h80" stroke="#1F1C17" strokeWidth="1.4" opacity=".4" />
      <rect x="226" y="196" width="48" height="40" fill="#17463C" stroke="#1F1C17" strokeWidth="2.2" />
      <circle cx="264" cy="216" r="3" fill="#D8951F" />
      <rect x="186" y="88" width="128" height="26" fill="#17463C" />
      <g clipPath="url(#aw2)">
        <rect x="202" y="88" width="16" height="26" fill="#F5E3B8" />
        <rect x="234" y="88" width="16" height="26" fill="#F5E3B8" />
        <rect x="266" y="88" width="16" height="26" fill="#F5E3B8" />
        <rect x="298" y="88" width="16" height="26" fill="#F5E3B8" />
      </g>
      <rect x="186" y="88" width="128" height="26" fill="none" stroke="#1F1C17" strokeWidth="2.4" />
      <path
        d="M186,114 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0"
        fill="#17463C"
        stroke="#1F1C17"
        strokeWidth="2.2"
      />
      <rect x="234" y="66" width="12" height="22" fill="#AC452F" stroke="#1F1C17" strokeWidth="2" />
      <circle cx="240" cy="60" r="8" fill="#D8951F" stroke="#1F1C17" strokeWidth="2" />

      <rect x="340" y="152" width="112" height="84" fill="#FCF8EF" stroke="#1F1C17" strokeWidth="2.4" />
      <rect x="356" y="176" width="34" height="34" fill="#DEE9D5" stroke="#1F1C17" strokeWidth="2" />
      <rect x="400" y="176" width="36" height="60" fill="#17463C" stroke="#1F1C17" strokeWidth="2.2" />
      <rect x="332" y="126" width="128" height="26" fill="#D8951F" />
      <g clipPath="url(#aw3)">
        <rect x="348" y="126" width="16" height="26" fill="#FCF8EF" />
        <rect x="380" y="126" width="16" height="26" fill="#FCF8EF" />
        <rect x="412" y="126" width="16" height="26" fill="#FCF8EF" />
        <rect x="444" y="126" width="16" height="26" fill="#FCF8EF" />
      </g>
      <rect x="332" y="126" width="128" height="26" fill="none" stroke="#1F1C17" strokeWidth="2.4" />
      <path
        d="M332,152 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0 a8,8 0 0,0 16,0"
        fill="#D8951F"
        stroke="#1F1C17"
        strokeWidth="2.2"
      />
      <circle cx="332" cy="222" r="9" fill="#AC452F" stroke="#1F1C17" strokeWidth="2" />
      <circle cx="350" cy="226" r="7" fill="#4B7A45" stroke="#1F1C17" strokeWidth="2" />

      <path
        d="M104 300c0-6 5-11 11-11h132c6 0 11 5 11 11v40c0 6-5 11-11 11H115c-6 0-11-5-11-11z"
        fill="#FCF8EF"
        stroke="#1F1C17"
        strokeWidth="2.6"
      />
      <path d="M258 289h132c6 0 11 5 11 11v40c0 6-5 11-11 11H258z" fill="#FCF8EF" stroke="#1F1C17" strokeWidth="2.6" />
      <path d="M258 286v70" stroke="#1F1C17" strokeWidth="2.2" />
      <path d="M116 300h132" stroke="#AC452F" strokeWidth="2" opacity=".7" />
      <g stroke="#C3B394" strokeWidth="1.8">
        <path d="M120 314h120M120 328h120M120 342h88" />
        <path d="M276 306h112M276 320h112M276 334h112M276 348h72" />
      </g>
      <path
        d="M272 300l14 14 26-30"
        stroke="#4B7A45"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="410" cy="286" r="34" fill="#DEE9E2" stroke="#1F1C17" strokeWidth="3" />
      <circle cx="410" cy="286" r="24" fill="none" stroke="#17463C" strokeWidth="2" opacity=".5" />
      <path d="M434 310l22 22" stroke="#1F1C17" strokeWidth="7" strokeLinecap="round" />

      <path
        d="M62 286h30l-4 34c-.4 4-3.6 6-7.6 6H73.6c-4 0-7.2-2-7.6-6z"
        fill="#F5E3B8"
        stroke="#1F1C17"
        strokeWidth="2.4"
      />
      <path d="M64 298h26" stroke="#AC452F" strokeWidth="3" />
      <path
        d="M72 278c0-6 6-6 6-12M84 278c0-6 6-6 6-12"
        stroke="#8B8272"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />

      <rect x="0" y="0" width="520" height="380" filter="url(#gr)" opacity=".16" style={{ mixBlendMode: 'multiply' }} />
    </svg>
  );
}
