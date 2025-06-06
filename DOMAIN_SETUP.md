{\rtf1\fbidis\ansi\ansicpg1255\deff0\nouicompat{\fonttbl{\f0\fnil\fcharset177 Calibri;}{\f1\fnil\fcharset0 Calibri;}}
{\colortbl ;\red0\green0\blue255;}
{\*\generator Riched20 10.0.19041}\viewkind4\uc1 
\pard\rtlpar\sa200\sl276\slmult1\f0\rtlch\fs22\lang1037 # \f1\ltrch\lang1033 Domain Setup for FraudGuard\f0\rtlch\lang1037\par
\par
\f1\ltrch\lang1033 To use your custom domain (e.g., {{\field{\*\fldinst{HYPERLINK https://getfraudguard.com }}{\fldrslt{https://getfraudguard.com\ul0\cf0}}}}\f1\fs22 ) with FraudGuard\f0\rtlch\lang1037 :\par
\par
\f1\ltrch\lang1033 1\f0\rtlch\lang1037 . \f1\ltrch\lang1033 Set the following in your `.env.local` file\f0\rtlch\lang1037 :\par
   - `\f1\ltrch\lang1033 NEXT_PUBLIC_BASE_URL=https://getfraudguard.com\f0\rtlch\lang1037 `\par
\f1\ltrch\lang1033 2\f0\rtlch\lang1037 . \f1\ltrch\lang1033 If using Vercel\f0\rtlch\lang1037 :\par
   - \f1\ltrch\lang1033 Update your project settings to include `getfraudguard.com` (and optionally `www.getfraudguard.com`)\f0\rtlch\lang1037 .\par
\f1\ltrch\lang1033 3\f0\rtlch\lang1037 . \f1\ltrch\lang1033 In your DNS settings\f0\rtlch\lang1037 :\par
   - \f1\ltrch\lang1033 Create the required CNAME or A record pointing to your hosting provider\f0\rtlch\lang1037 .\par
\f1\ltrch\lang1033 4\f0\rtlch\lang1037 . \f1\ltrch\lang1033 For email\f0\rtlch\lang1037 :\par
   - \f1\ltrch\lang1033 Configure SPF and DKIM settings as needed for your domain\f0\rtlch\lang1037 .\par
\par
\f1\ltrch\lang1033 This ensures that all endpoints and email verification links correctly use your custom domain\f0\rtlch\lang1037 .\par
}
 