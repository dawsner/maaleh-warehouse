import React from 'react'

/**
 * לוגו מעלה — בית הספר לקולנוע.
 *
 * כברירת מחדל הקומפוננטה משתמשת בלוגו הרשמי מאתר maale.co.il.
 * רוצים לארח אותו לוקאלית?
 *   1. שמור את הקובץ ב-frontend/public/maaleh-logo.png
 *   2. שנה את LOGO_SRC ל-'/maaleh-logo.png'
 *
 * Props:
 *  - size: 'sm' | 'md' | 'lg' | 'xl'  (default md)
 *  - variant: 'light' (טקסט שחור — לרקע בהיר) | 'dark' (טקסט לבן — לרקע כהה)
 *  - withText: false כדי להציג רק את הסמל בלי טקסט נוסף
 */

const LOGO_SRC = 'https://www.maale.co.il/sites/default/files/logoMaalehHeb.png'

export default function Logo({ size = 'md', variant = 'light', withText = false }) {
  const sizes = {
    sm: { h: 28, fontMain: 'text-sm', fontSub: 'text-[10px]' },
    md: { h: 40, fontMain: 'text-lg', fontSub: 'text-[11px]' },
    lg: { h: 56, fontMain: 'text-2xl', fontSub: 'text-sm' },
    xl: { h: 80, fontMain: 'text-3xl', fontSub: 'text-base' },
  }
  const cfg = sizes[size] || sizes.md
  const textColor = variant === 'dark' ? 'text-white' : 'text-slate-900'
  const subColor = variant === 'dark' ? 'text-slate-300' : 'text-slate-500'

  return (
    <div className="flex items-center gap-3" dir="rtl">
      <img
        src={LOGO_SRC}
        alt="מעלה — בית הספר לקולנוע"
        style={{ height: `${cfg.h}px`, width: 'auto' }}
        className="object-contain flex-shrink-0"
        loading="lazy"
      />
      {withText && (
        <div className="leading-tight">
          <p className={`font-extrabold ${cfg.fontMain} ${textColor}`}>מערכת מחסן</p>
          <p className={`${cfg.fontSub} ${subColor} font-medium`}>ניהול השאלות</p>
        </div>
      )}
    </div>
  )
}
