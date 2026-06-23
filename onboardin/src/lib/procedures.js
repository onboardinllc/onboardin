/**
 * Onboardin Procedure Library v1
 *
 * Canonical source for all jurisdiction-specific formation and compliance procedures.
 * Shape is compatible with getDocCategories() in App.jsx — each entry maps to a vault card.
 *
 * Wire-back: when promoting to production, replace the inline objects inside getDocCategories()
 * with imports from this file, keyed by `${country}_${entityType}`.
 *
 * Each procedure has:
 *   id        — matches vault card id in getDocCategories
 *   label     — vault card title
 *   icon      — Phosphor icon class
 *   desc      — one-line description shown on the card
 *   required  — boolean
 *   process   — { title, pick, tracks[] }
 *     track:  { label, time, cost, steps[] }
 *     step:   { action, url?, cta?, portalUrl?, portalCta?, note? }
 *             url/cta = on-platform download; portalUrl/portalCta = external filing portal
 *
 * Last researched: 2026-06-04. Fees verified against official sources.
 * Delaware HB 400 (enacted 2026) fee increases reflected below.
 */

// ─── JAMAICA LTD ──────────────────────────────────────────────────────────────

export const JAMAICA_LTD = [
    {
        id: 'gov_id',
        label: 'Government ID',
        icon: 'ph-identification-card',
        desc: 'Valid photo ID for each director and shareholder.',
        required: true,
        process: {
            title: 'Get your Government ID',
            pick: 'Pick the fastest option:',
            tracks: [
                {
                    label: 'Passport (recommended)',
                    time: '7 working days standard / same-day if submitted before 11 AM',
                    cost: '$6,500 JMD standard / $21,500 JMD same-day',
                    steps: [
                        { action: 'Go to the PICA online portal or visit 25 Constant Spring Road, Kingston.', url: 'https://www.pica.gov.jm', cta: 'Open PICA portal' },
                        { action: 'Bring: birth certificate, 2 passport photos, existing valid ID, and payment.' },
                        { action: 'Choose "New Application" (first passport) or "Renewal". Pay at counter.' },
                        { action: 'Collect in 7 working days. Same-day processing available if submitted by 11 AM at head office.' },
                    ],
                },
                {
                    label: "Voter's ID (free, but slow)",
                    time: '3–6 months',
                    cost: 'Free',
                    steps: [
                        { action: 'Register at the Electoral Office of Jamaica portal or your parish office.', url: 'https://www.eoj.com.jm', cta: 'Open EOJ portal' },
                        { action: 'Bring: birth certificate and proof of address (utility bill or bank statement).' },
                        { action: 'Complete the registration form. ID is mailed to your address within 3–6 months.' },
                        { action: 'Apply immediately if you choose this route — use your passport for anything time-sensitive in the meantime.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'personal_trn',
        label: 'Personal TRN',
        icon: 'ph-receipt',
        desc: 'Taxpayer Registration Number required for all directors and shareholders.',
        required: true,
        process: {
            title: 'Get your personal TRN',
            pick: null,
            tracks: [
                {
                    label: 'In person at TAJ (same-day)',
                    time: 'Same day',
                    cost: 'Free',
                    steps: [
                        { action: 'Go to any Tax Administration Jamaica office. Locate the TRN desk.', url: 'https://www.jamaicatax.gov.jm', cta: 'Find TAJ offices' },
                        { action: 'Bring: valid Passport OR Driver\'s License. If you have neither, bring your Voter\'s ID plus your Birth Certificate.' },
                        { action: 'Complete Form 1 (Application for Taxpayer Registration — Individuals). This is provided at the counter at no cost.' },
                        { action: 'Your TRN is issued the same day. Record it — you need it for every subsequent step.' },
                    ],
                },
                {
                    label: 'Overseas / by mail',
                    time: '2–5 weeks',
                    cost: 'Free',
                    steps: [
                        { action: 'Download Form 1 from the TAJ website.', url: 'https://www.jamaicatax.gov.jm/documents/10181/11382/form1.pdf', cta: 'Download Form 1' },
                        { action: 'Complete the form. Have your ID notarized by a Notary Public in your country.' },
                        { action: 'Mail the notarized package to: Tax Administration Jamaica, TRN Unit, 101 Old Hope Road, Kingston 6.' },
                        { action: 'TRN is mailed back within 2–5 weeks.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'articles',
        label: 'Certificate of Incorporation',
        icon: 'ph-file-text',
        desc: 'Certificate of Incorporation from the Companies Office of Jamaica (COJ).',
        required: true,
        process: {
            title: 'Incorporate at the Companies Office of Jamaica',
            pick: null,
            tracks: [
                {
                    label: 'COJ standard process (4–6 working days)',
                    time: '4–6 working days. Same-day available for extra J$1,500–4,000.',
                    cost: '~J$28,000 total (registration fee + stamp duty). Name reservation: J$3,000 JMD.',
                    steps: [
                        { action: 'Search your proposed company name at the COJ to confirm it is available. Reserve it using Form 6 (J$3,000 JMD, holds the name for 90 days).', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-6.pdf', cta: 'Download Form 6', portalUrl: 'https://www.orcjamaica.com', portalCta: 'COJ portal' },
                        { action: 'Download and complete the BRF1 "Super Form". This single form simultaneously registers your company with COJ, TAJ (company TRN + TCC), NIS, NHT, and HEART. You do not file those separately.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/brf1.pdf', cta: 'Download BRF1', portalUrl: 'https://www.orcjamaica.com/Forms.aspx', portalCta: 'COJ forms portal' },
                        { action: 'Complete Form 1A (Articles of Incorporation). Include: proposed company name, registered office address in Jamaica, names and addresses of all directors, and authorized share capital.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-1a.pdf', cta: 'Download Form 1A' },
                        { action: 'Complete the Beneficial Ownership Return (BOR) forms. Use Form A for individual shareholders and Form B for corporate shareholders. Mandatory since 2023.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-a.pdf', cta: 'Download Form A (BOR)' },
                        { action: 'Gather for all directors: valid government ID (passport, driver\'s license, or voter\'s ID), personal TRN, and proof of residential address.' },
                        { action: 'Submit all forms at the COJ office (14 Camp Road, Kingston) or via the online portal. Pay the fee at the counter. Request same-day processing if you need it (submit before 11 AM).' },
                        { action: 'Receive your Certificate of Incorporation (typically 4–6 days). Your company TRN and initial 90-day TCC are issued at the same time. Upload your Certificate here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'jam_brc',
        label: 'BRC / Tax Compliance Certificate',
        icon: 'ph-certificate',
        desc: 'Business Registration Certificate and Tax Compliance Certificate from TAJ.',
        required: true,
        process: {
            title: 'Get and maintain your BRC and TCC',
            pick: null,
            tracks: [
                {
                    label: 'Initial issuance (automatic with COJ filing)',
                    time: 'Issued with Certificate of Incorporation',
                    cost: 'Included in COJ fee',
                    steps: [
                        { action: 'Your BRC and initial 90-day TCC are issued automatically when COJ processes your BRF1 Super Form. No separate application required.' },
                        { action: 'Find your company TRN on the COJ confirmation letter. Record it — you need it for banking and tax filings.' },
                        { action: 'Upload your BRC or Certificate of Incorporation here to confirm receipt.' },
                    ],
                },
                {
                    label: 'TCC renewal (every 90 days)',
                    time: 'Same day online / 2–7 days in person',
                    cost: 'Free',
                    steps: [
                        { action: 'Log in to the TAJ eServices portal with your company TRN.', url: 'https://www.jamaicatax.gov.jm', cta: 'Open TAJ portal' },
                        { action: 'TAJ now auto-renews TCCs electronically for compliant taxpayers. Check if your renewal happened automatically before visiting in person.' },
                        { action: 'If auto-renewal failed: ensure all statutory deductions (NIS, NHT, HEART) are paid and filed up to date. TAJ verifies these electronically — no clearance letters required.' },
                        { action: 'Submit the digital TCC renewal application. Approval is typically same day online, or 2–7 days via branch visit.' },
                        { action: 'Download your renewed TCC and upload it here. Banks require a current TCC.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'nis_nht_heart',
        label: 'NIS / NHT / HEART Registration',
        icon: 'ph-users-three',
        desc: 'Statutory employer registrations — NIS, NHT, and HEART Trust.',
        required: true,
        process: {
            title: 'Employer statutory registrations',
            pick: null,
            tracks: [
                {
                    label: 'Via BRF1 Super Form (if incorporating now)',
                    time: '4–6 working days (with COJ filing)',
                    cost: 'Free — included in COJ process',
                    steps: [
                        { action: 'The BRF1 Super Form handles NIS, NHT, and HEART registration automatically when you incorporate. No separate applications needed.' },
                        { action: 'Confirm your NIS Employer Reference Number was included in your COJ confirmation documents. If missing, contact MLSS.', url: 'https://www.mlss.gov.jm', cta: 'MLSS contact' },
                        { action: 'NHT registration is confirmed via the NHT Employer Portal. Your company TRN is the login credential.', url: 'https://www.nht.gov.jm/employers', cta: 'NHT Employer Portal' },
                    ],
                },
                {
                    label: 'Separate registration (existing company)',
                    time: '2–5 working days per agency',
                    cost: 'Free',
                    steps: [
                        { action: 'NIS: Complete Form R1 (Employer/Business Registration). Bring Certificate of Incorporation, company TRN, valid ID for all directors.', url: 'https://www.mlss.gov.jm', cta: 'Download Form R1' },
                        { action: 'NHT: Apply at the NHT Employer Portal or any NHT branch. Bring Certificate of Incorporation and company TRN.', url: 'https://www.nht.gov.jm/employers', cta: 'NHT portal' },
                        { action: 'HEART: Registration is automatic once your monthly payroll exceeds J$14,444. No advance application — liability starts the month you cross the threshold.' },
                        { action: 'File monthly statutory remittances using Form S01 via the TAJ eServices portal for all three (NIS + NHT + HEART on the same form).', url: 'https://www.jamaicatax.gov.jm', cta: 'TAJ eServices' },
                    ],
                },
            ],
        },
    },
    {
        id: 'gct_registration',
        label: 'GCT Registration',
        icon: 'ph-percent',
        desc: 'General Consumption Tax registration. Mandatory above J$15M annual turnover.',
        required: false,
        process: {
            title: 'Register for General Consumption Tax',
            pick: null,
            tracks: [
                {
                    label: 'Online registration at TAJ',
                    time: 'Same day (near-instant if documents are valid)',
                    cost: 'Free',
                    steps: [
                        { action: 'GCT registration is mandatory if your annual gross turnover exceeds J$15,000,000. Voluntary registration is permitted below this threshold.' },
                        { action: 'Log in to the TAJ eServices portal and navigate to GCT Registration.', url: 'https://www.jamaicatax.gov.jm', cta: 'Open TAJ portal' },
                        { action: 'Complete Form GCT-1. Provide: company TRN, Certificate of Incorporation, bank statements or sales ledgers proving threshold breach, and director IDs.' },
                        { action: 'You must register within 21 days of hitting the J$15M threshold. Late registration can result in backdated liability.' },
                        { action: 'Once registered, file and remit GCT monthly via TAJ eServices. GCT rate is 15% standard.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'coj_annual_return',
        label: 'COJ Annual Return',
        icon: 'ph-calendar-check',
        desc: 'Annual return filed with the Companies Office of Jamaica. Due each year.',
        required: true,
        process: {
            title: 'File your Annual Return with COJ',
            pick: null,
            tracks: [
                {
                    label: 'Online or in person at COJ',
                    time: '~10 working days standard / same-day for J$1,500–4,000 surcharge',
                    cost: 'J$5,000 standard. Late fee: J$100/day up to J$10,000 maximum.',
                    steps: [
                        { action: 'File within 42 days of your company\'s financial year end. Failure to file on time triggers J$100/day in penalties.' },
                        { action: 'Complete Form 19A (Profit-Making Company Annual Return). Available at the COJ portal.', url: 'https://www.orcjamaica.com', cta: 'COJ portal' },
                        { action: 'Attach an updated Beneficial Ownership Return (BOR). Required every year since 2023. Use Form A for individuals, Form B for corporates.' },
                        { action: 'Pay J$5,000 at the COJ counter or online. Request same-day processing for an additional J$1,500–4,000 if you need the stamped return quickly.' },
                        { action: 'Retain the COJ-stamped Form 19A. Banks and government agencies may request it.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'operating_agreement',
        label: 'Shareholders Agreement',
        icon: 'ph-handshake',
        desc: 'Private agreement defining share transfers, reserved matters, and founder rights.',
        required: false,
        templateUrl: 'https://onboardin.llc/templates/jm-shareholders-agreement.pdf',
        process: {
            title: 'Draft your Shareholders Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1–3 days',
                    cost: 'Free (template). Attorney review: J$50,000–150,000.',
                    steps: [
                        { action: 'Download the Onboardin Shareholders Agreement template.', url: 'https://onboardin.llc/templates/jm-shareholders-agreement.pdf', cta: 'Download template' },
                        { action: 'Include a Right of First Refusal clause: shares cannot be sold to outside parties without offering existing shareholders first at the same price.' },
                        { action: 'List your Reserved Matters — decisions requiring 75% or 100% shareholder approval: taking on debt over a threshold, issuing new shares, selling the company.' },
                        { action: 'Add drag-along rights (majority can force minority to sell) and tag-along rights (minority can join any sale on the same terms).' },
                        { action: 'Add a shotgun clause for deadlock resolution: either shareholder can name a price; the other must buy at that price or sell at it. Resolves 50/50 deadlocks.' },
                        { action: 'All shareholders sign the agreement. This document is private — do not file it with the COJ.' },
                        { action: 'Upload your signed agreement here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'banking',
        label: 'Business Bank Account',
        icon: 'ph-bank',
        desc: 'Business bank account letter or voided cheque from your Jamaican bank.',
        required: false,
        process: {
            title: 'Open a business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'NCB SME On-The-Go (lowest cost)',
                    time: '5–7 working days',
                    cost: 'J$2,000 minimum opening deposit. Monthly fee varies by account type.',
                    steps: [
                        { action: 'Prepare a 12-month Cash Flow Projection and a Board Resolution. The Board Resolution must state: (1) authorisation to open the account, (2) names of all authorised signatories, (3) signing mandate (e.g. "any two to sign"), (4) specific authority for NCB e-Link online banking access.', url: 'https://www.jncb.com/Business/SME-Corner/SME-On-The-Go', cta: 'NCB SME page' },
                        { action: 'Submit the online application via the NCB portal and upload digital copies of your Certificate of Incorporation, BRC, TCC, and government ID for all directors.' },
                        { action: 'Attend an in-branch appointment to sign the Signature Card, FATCA forms, and have original documents physically verified. Bring all originals — do not rely on photocopies.' },
                        { action: 'If the branch manager requests it, provide professional reference letters from an Attorney, JP, or Chartered Accountant. One letter per director.' },
                        { action: 'Account number is issued within 1–3 days. NCB Business Online access takes a further 3–5 days. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'JMMB Business (better for SaaS / ACH)',
                    time: '3–5 working days (plus mandatory site visit)',
                    cost: 'J$1,000 minimum deposit. Monthly fee: J$1,035.',
                    steps: [
                        { action: 'Gather Form 23 (List of Directors — from COJ) and prepare a 3-year Cash Flow Projection. JMMB requires this for startup accounts.', url: 'https://jm.jmmb.com/business-banking', cta: 'JMMB Business' },
                        { action: 'Draft a Board Resolution authorising the JMMB relationship. Must include: all authorised signers with specimen signatures, and the Company Seal or Stamp.' },
                        { action: 'Obtain two character references for each director. Eligible referees: Justice of the Peace, Notary Public, Minister of Religion, Lawyer, Medical Doctor, or a JMMB client of over 2 years. No family members.' },
                        { action: 'Complete Business Account Opening Form AOB-032023. Attach BRC, TCC, Articles of Incorporation, Certificate of Incorporation, and proof of address for all signatories.' },
                        { action: 'A JMMB representative will conduct a mandatory physical site visit to your business premises or registered office. Schedule this in advance.' },
                        { action: 'Account approval and JMMB Moneyline online banking credentials arrive within 24–48 hours of the site visit. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'Scotiabank Business (USD-friendly)',
                    time: '48–72 hours after appointment',
                    cost: 'J$10,000 minimum opening balance (Chequing). Monthly service charge: J$1,035.',
                    steps: [
                        { action: 'Book a business banking appointment at your nearest Scotiabank branch.', url: 'https://jm.scotiabank.com/business-banking.html', cta: 'Scotiabank Business' },
                        { action: 'Bring: Certificate of Incorporation, Articles of Incorporation, company TRN, directors\' TRNs, and proof of address (utility bill under 6 months old).' },
                        { action: 'Provide two character references — from a Justice of the Peace or another bank.' },
                        { action: 'Bring a Directors\' Resolution authorising the account, listing authorised signatories and signing mandate.' },
                        { action: 'Provide 12 months of bank statements or audited financials as financial history.' },
                        { action: 'In-branch signing of Signature Card, Operation of Account Agreement, and Business Services Application. Account active within 48–72 hours.' },
                        { action: 'Download your bank letter and upload it here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'founder_docs',
        label: 'Founder Agreement',
        icon: 'ph-user-list',
        desc: 'Signed founder agreement covering equity, vesting, IP assignment, and dispute resolution.',
        required: true,
        templateUrl: 'https://onboardin.llc/templates/founder-agreement-v1.pdf',
        process: {
            title: 'Draft and sign your Founder Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1–2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin Founder Agreement template.', url: 'https://onboardin.llc/templates/founder-agreement-v1.pdf', cta: 'Download template' },
                        { action: 'Fill in: each founder\'s full legal name, equity percentage, vesting schedule (4-year / 1-year cliff is standard), and role.' },
                        { action: 'Review the IP assignment clause — it must state that all work done for the company belongs to the company, not the individual.' },
                        { action: 'Add a shotgun clause for dispute resolution. This lets any founder buy out the other at a set price to break deadlocks.' },
                        { action: 'All founders sign the agreement. Have signatures witnessed by a JP or attorney if possible.' },
                        { action: 'Upload the signed agreement here.' },
                    ],
                },
            ],
        },
    },
];

// ─── US DELAWARE LLC ──────────────────────────────────────────────────────────

export const US_DE_LLC = [
    {
        id: 'gov_id',
        label: 'Government ID',
        icon: 'ph-identification-card',
        desc: 'Valid photo ID for each member / registered agent.',
        required: true,
        process: {
            title: 'Government ID',
            pick: 'Any one of these is accepted:',
            tracks: [
                { label: 'Passport', time: 'Varies', cost: 'Varies', steps: [{ action: 'Use your existing passport. Must be valid (not expired).' }] },
                { label: "Driver's License", time: 'Varies', cost: 'Varies', steps: [{ action: 'Current government-issued driver\'s license with photo is accepted.' }] },
                { label: 'State ID', time: 'Varies', cost: 'Varies', steps: [{ action: 'A government-issued state or national ID card with photo is accepted.' }] },
            ],
        },
    },
    {
        id: 'registered_agent',
        label: 'Delaware Registered Agent',
        icon: 'ph-map-pin',
        desc: 'A physical Delaware address to receive legal documents. Required by state law.',
        required: true,
        process: {
            title: 'Appoint a Delaware Registered Agent',
            pick: 'Choose a registered agent service:',
            tracks: [
                {
                    label: 'Northwest Registered Agent ($125/yr)',
                    time: 'Instant',
                    cost: '$125/year',
                    steps: [
                        { action: 'Go to Northwest Registered Agent and select Delaware as your state.', url: 'https://www.northwestregisteredagent.com', cta: 'Northwest Registered Agent' },
                        { action: 'Purchase the registered agent service. You receive a Delaware address immediately.' },
                        { action: 'Use this address as your Registered Agent address on your Certificate of Formation.' },
                    ],
                },
                {
                    label: 'ZenBusiness ($199/yr bundled)',
                    time: 'Instant',
                    cost: '$199/year (includes formation filing)',
                    steps: [
                        { action: 'ZenBusiness handles both the registered agent and the Certificate of Formation filing.', url: 'https://www.zenbusiness.com', cta: 'ZenBusiness' },
                        { action: 'Select Delaware LLC formation. Registered agent is included.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'articles',
        label: 'Certificate of Formation',
        icon: 'ph-file-text',
        desc: 'Filed with Delaware Division of Corporations to create your LLC.',
        required: true,
        process: {
            title: 'File your Certificate of Formation (Delaware)',
            pick: null,
            tracks: [
                {
                    label: 'Online via Delaware eCorp (standard)',
                    time: '3–5 business days standard. Expedited: 24-hour ($50), same-day ($100).',
                    cost: '$200 filing fee (effective Aug 1, 2026 under HB 400; previously $110). Certified copy: $50 extra.',
                    steps: [
                        { action: 'Go to the Delaware Division of Corporations eCorp filing portal.', url: 'https://corp.delaware.gov', cta: 'Delaware eCorp portal' },
                        { action: 'Upload your completed Certificate of Formation (Form 18-201). Required fields: LLC name (must include "LLC" or "L.L.C."), name and address of your Registered Agent, and name/address of the organizer.' },
                        { action: 'Pay the $200 filing fee online. Select expedited processing if needed (24-hour: $50 surcharge, same-day: $100 surcharge, 2-hour: $500 surcharge).' },
                        { action: 'You receive a stamped "Filed" copy of your Certificate and a Filing Memo. Download and save both. Upload the stamped Certificate here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'operating_agreement',
        label: 'Operating Agreement',
        icon: 'ph-handshake',
        desc: 'Internal governance document. Not filed with the state but required for banking.',
        required: true,
        templateUrl: 'https://onboardin.llc/templates/llc-operating-agreement.pdf',
        process: {
            title: 'Draft your LLC Operating Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1–2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin LLC Operating Agreement template.', url: 'https://onboardin.llc/templates/llc-operating-agreement.pdf', cta: 'Download template' },
                        { action: 'Fill in: member names, ownership percentages, voting rules (majority or unanimous), management structure (member-managed or manager-managed), and capital contributions.' },
                        { action: 'Add a buyout clause defining what happens if a member wants to leave or dies.' },
                        { action: 'All members sign the agreement. This is a private document — do not file it with Delaware.' },
                        { action: 'Your bank will ask for this when you open the business account. Upload a signed copy here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'tax_id',
        label: 'EIN Confirmation',
        icon: 'ph-receipt',
        desc: 'IRS Employer Identification Number — required for banking and tax filings.',
        required: true,
        process: {
            title: 'Get your EIN from the IRS',
            pick: 'Choose your method:',
            tracks: [
                {
                    label: 'Online (US persons with SSN — instant)',
                    time: 'Immediate',
                    cost: 'Free',
                    steps: [
                        { action: 'Go to the IRS EIN Online Assistant. Available Monday–Friday 7 AM – 10 PM ET.', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', cta: 'IRS EIN Assistant' },
                        { action: 'Select "Limited Liability Company" as your entity type, then your state of formation (Delaware).' },
                        { action: 'Enter the responsible party\'s SSN or ITIN. Complete the online form.' },
                        { action: 'Your EIN is displayed immediately on screen. Download the CP 575 confirmation letter and upload it here.' },
                    ],
                },
                {
                    label: 'By fax (international founders — 4 business days)',
                    time: '4 business days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download Form SS-4 (Rev. Dec 2025 or later) from the IRS.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/irs/fss4.pdf', cta: 'Download Form SS-4' },
                        { action: 'On Line 7b, write "Foreign" (since you have no SSN). Line 7a must be a natural person\'s name as the Responsible Party.' },
                        { action: 'Fax the completed form to: +1-304-707-9471 (International fax line). Include a return fax number on the cover sheet.' },
                        { action: 'You receive your EIN by fax within 4 business days. The physical CP 575 letter arrives by mail in 4–6 weeks. Upload whichever you receive first.' },
                    ],
                },
                {
                    label: 'By phone (international founders — immediate)',
                    time: 'Immediate',
                    cost: 'Free',
                    steps: [
                        { action: 'Call the IRS international EIN line: +1-267-941-1099. Available Monday–Friday 6 AM – 11 PM ET.' },
                        { action: 'Have your completed Form SS-4 in front of you. The agent will ask for the information on the form and issue your EIN verbally during the call.' },
                        { action: 'Write down the EIN immediately. The CP 575 confirmation letter arrives by mail in 4–6 weeks.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'boi_report',
        label: 'BOI Report (FinCEN)',
        icon: 'ph-shield-check',
        desc: 'Beneficial Ownership Information report. Foreign-formed entities only as of 2026.',
        required: false,
        process: {
            title: 'Beneficial Ownership Information (BOI) Report',
            pick: null,
            tracks: [
                {
                    label: 'March 2025 IFR — domestic US entities not reporting companies',
                    time: 'N/A for domestic LLCs',
                    cost: 'Free',
                    steps: [
                        { action: 'Domestic U.S.-formed LLCs are not reporting companies under FinCEN\'s March 2025 interim final rule. Monitor fincen.gov/boi for the final rule.' },
                        { action: 'If your LLC was formed outside the US and registered to do business in the US: you must file within 30 days of registration.', url: 'https://boiefiling.fincen.gov', cta: 'FinCEN BOI portal' },
                    ],
                },
            ],
        },
    },
    {
        id: 'us_annual_tax',
        label: 'Delaware Annual Franchise Tax',
        icon: 'ph-calendar-check',
        desc: 'Delaware LLC flat annual tax. Due June 1 each year.',
        required: true,
        process: {
            title: 'Pay Delaware LLC Annual Tax',
            pick: null,
            tracks: [
                {
                    label: 'Online at Delaware eCorp',
                    time: 'Immediate payment / due June 1',
                    cost: '$300/year flat (increasing to $400 for 2026 tax year, payable 2027).',
                    steps: [
                        { action: 'Delaware LLCs pay a flat annual tax of $300. No annual report form is required — only the payment.' },
                        { action: 'Pay by June 1 each year at the Delaware Division of Corporations payment portal.', url: 'https://corp.delaware.gov/paytaxes/', cta: 'Pay Delaware taxes' },
                        { action: 'Late payments incur a $200 penalty plus 1.5% monthly interest. Pay on time.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'banking',
        label: 'Business Bank Account',
        icon: 'ph-bank',
        desc: 'US business bank account. Required for accepting payments and filing taxes.',
        required: false,
        process: {
            title: 'Open a US business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'Mercury (best for startups / remote founders)',
                    time: '1–3 business days',
                    cost: 'Free. No minimum balance, no monthly fees.',
                    steps: [
                        { action: 'Apply online at Mercury. No branch visit required. Accepts international founders with a US LLC.', url: 'https://mercury.com', cta: 'Mercury bank' },
                        { action: 'Provide: Certificate of Formation, EIN confirmation, government ID for all owners over 25%, and your Operating Agreement.' },
                        { action: 'Account typically approved in 1–3 business days. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'Relay (good for multi-account setups)',
                    time: '2–4 business days',
                    cost: 'Free. No minimum balance.',
                    steps: [
                        { action: 'Apply at Relay. Designed for small businesses and startups.', url: 'https://relayfi.com', cta: 'Relay bank' },
                        { action: 'Provide: Certificate of Formation, EIN, government ID.' },
                        { action: 'Supports up to 20 sub-accounts — useful for separating operating cash, payroll, and tax reserves.' },
                    ],
                },
                {
                    label: 'Novo (fast, app-first)',
                    time: '1–2 business days',
                    cost: 'Free.',
                    steps: [
                        { action: 'Apply at Novo. Strong integration with Stripe and Shopify.', url: 'https://www.novo.co', cta: 'Novo bank' },
                        { action: 'Provide: EIN, Certificate of Formation, owner ID.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'founder_docs',
        label: 'Founder Agreement',
        icon: 'ph-user-list',
        desc: 'Signed founder agreement covering equity, vesting, IP assignment.',
        required: true,
        templateUrl: 'https://onboardin.llc/templates/founder-agreement-v1.pdf',
        process: {
            title: 'Draft and sign your Founder Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1–2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin Founder Agreement template.', url: 'https://onboardin.llc/templates/founder-agreement-v1.pdf', cta: 'Download template' },
                        { action: 'Fill in: each founder\'s full legal name, equity percentage, vesting schedule (4-year / 1-year cliff is standard), and role.' },
                        { action: 'Review the IP assignment clause — all work done for the company belongs to the company.' },
                        { action: 'All founders sign. If co-founders are in multiple countries, DocuSign is sufficient.' },
                        { action: 'Upload the signed agreement here.' },
                    ],
                },
            ],
        },
    },
];

// ─── US DELAWARE C-CORP ───────────────────────────────────────────────────────

export const US_DE_CCORP = [
    {
        id: 'gov_id',
        label: 'Government ID',
        icon: 'ph-identification-card',
        desc: 'Valid photo ID for all directors and officers.',
        required: true,
        process: {
            title: 'Government ID',
            pick: 'Any one of these is accepted:',
            tracks: [
                { label: 'Passport', time: 'Varies', cost: 'Varies', steps: [{ action: 'Use your existing valid passport.' }] },
                { label: "Driver's License", time: 'Varies', cost: 'Varies', steps: [{ action: 'Current government-issued driver\'s license with photo.' }] },
            ],
        },
    },
    {
        id: 'registered_agent',
        label: 'Delaware Registered Agent',
        icon: 'ph-map-pin',
        desc: 'Required physical Delaware address for legal correspondence.',
        required: true,
        process: {
            title: 'Appoint a Delaware Registered Agent',
            pick: 'Choose a service:',
            tracks: [
                {
                    label: 'Northwest Registered Agent ($125/yr)',
                    time: 'Instant',
                    cost: '$125/year',
                    steps: [
                        { action: 'Purchase the service at Northwest Registered Agent.', url: 'https://www.northwestregisteredagent.com', cta: 'Northwest' },
                        { action: 'You receive a Delaware address immediately. Use it on your Certificate of Incorporation.' },
                    ],
                },
                {
                    label: 'CT Corporation (enterprise option)',
                    time: 'Instant',
                    cost: '$299+/year',
                    steps: [
                        { action: 'Used by most VC-backed companies.', url: 'https://www.ctcorporation.com', cta: 'CT Corporation' },
                    ],
                },
            ],
        },
    },
    {
        id: 'articles',
        label: 'Certificate of Incorporation',
        icon: 'ph-file-text',
        desc: 'Filed with Delaware Division of Corporations. Creates the legal entity.',
        required: true,
        process: {
            title: 'File your Certificate of Incorporation (Delaware)',
            pick: null,
            tracks: [
                {
                    label: 'Online via Delaware eCorp',
                    time: '3–5 business days standard.',
                    cost: '$200 minimum filing fee (effective Aug 1, 2026). Covers up to 1,500 no-par shares. Expedited: 24-hour ($300 surcharge), same-day ($500), 2-hour ($1,500), 1-hour ($2,500).',
                    steps: [
                        { action: 'Go to the Delaware Division of Corporations filing portal.', url: 'https://corp.delaware.gov', cta: 'Delaware eCorp portal' },
                        { action: 'Prepare your Certificate of Incorporation (Stock Corporation). Required fields: corporate name (must include "Inc." or "Corp."), registered agent name and address, total authorized shares and par value, and organizer name/address.' },
                        { action: 'Standard startup structure: 10,000,000 authorized shares at $0.0001 par value. This keeps Delaware franchise tax low under the assumed par value method.' },
                        { action: 'Pay the filing fee online. Choose your processing speed.' },
                        { action: 'You receive a stamped "Filed" Certificate of Incorporation. Download and save it. Upload here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'bylaws_governance',
        label: 'Bylaws & Board Consent',
        icon: 'ph-scroll',
        desc: 'Corporate bylaws and initial board resolutions. Not filed with the state.',
        required: true,
        templateUrl: 'https://onboardin.llc/templates/corp-bylaws.pdf',
        process: {
            title: 'Adopt Bylaws and Initial Board Consent',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1–2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin Corporate Bylaws template.', url: 'https://onboardin.llc/templates/corp-bylaws.pdf', cta: 'Download Bylaws' },
                        { action: 'Customize: number of directors, quorum rules, meeting procedures, officer titles.' },
                        { action: 'Draft the Initial Board Consent (Organizational Minutes). This adopts the bylaws, elects officers, authorizes bank account opening, and authorizes issuance of stock.' },
                        { action: 'Directors sign the Board Consent. File in your corporate records book.' },
                        { action: 'Upload your adopted bylaws here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'founder_stock',
        label: 'Founder Stock Issuance',
        icon: 'ph-chart-pie',
        desc: 'Stock Purchase Agreements and stock certificates for founding team.',
        required: true,
        templateUrl: 'https://onboardin.llc/templates/stock-purchase-agreement.pdf',
        process: {
            title: 'Issue founder stock',
            pick: null,
            tracks: [
                {
                    label: 'Standard issuance with vesting',
                    time: '1–3 days',
                    cost: 'Free (template). Attorneys typically charge $1,500–5,000 for this.',
                    steps: [
                        { action: 'Download the Stock Purchase Agreement template.', url: 'https://onboardin.llc/templates/stock-purchase-agreement.pdf', cta: 'Download SPA' },
                        { action: 'Founders purchase stock at par value ($0.0001/share is standard). A founder buying 5,000,000 shares pays $500 total.' },
                        { action: 'Attach a 4-year vesting schedule with 1-year cliff. This means 25% vests after year one, then monthly thereafter. Standard for investor expectations.' },
                        { action: 'Attach IP assignment language — confirm all prior work done for the company is assigned in the agreement.' },
                        { action: 'Each founder signs their SPA. The board countersigns. Issue stock certificates (even if electronic).' },
                        { action: 'File an 83(b) election within 30 days of stock issuance if shares are subject to vesting. This is critical for tax. See the 83(b) note.' },
                        { action: 'Upload signed SPAs and the board\'s stock issuance resolution here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'tax_id',
        label: 'EIN Confirmation',
        icon: 'ph-receipt',
        desc: 'IRS Employer Identification Number — required for banking and payroll.',
        required: true,
        process: {
            title: 'Get your EIN from the IRS',
            pick: 'Choose your method:',
            tracks: [
                {
                    label: 'Online (US persons with SSN — instant)',
                    time: 'Immediate',
                    cost: 'Free',
                    steps: [
                        { action: 'Go to the IRS EIN Online Assistant.', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', cta: 'IRS EIN Assistant' },
                        { action: 'Select "Corporation" as entity type.' },
                        { action: 'Complete the form. EIN displayed immediately. Download CP 575 and upload here.' },
                    ],
                },
                {
                    label: 'By fax (international founders — 4 business days)',
                    time: '4 business days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download Form SS-4.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/irs/fss4.pdf', cta: 'Download Form SS-4' },
                        { action: 'Write "Foreign" on Line 7b. Fax to +1-304-707-9471 with a return fax number.' },
                        { action: 'EIN arrives by fax within 4 business days.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'boi_report',
        label: 'BOI Report (FinCEN)',
        icon: 'ph-shield-check',
        desc: 'Beneficial Ownership Information — foreign-registered entities only in 2026.',
        required: false,
        process: {
            title: 'Beneficial Ownership Information (BOI)',
            pick: null,
            tracks: [
                {
                    label: 'March 2025 IFR — domestic corps not reporting companies',
                    time: 'N/A',
                    cost: 'Free',
                    steps: [
                        { action: 'Domestic US-formed corporations are not reporting companies under FinCEN\'s March 2025 interim final rule. Monitor for final rule.' },
                        { action: 'Foreign-formed entities registered in the US must file within 30 days.', url: 'https://boiefiling.fincen.gov', cta: 'FinCEN BOI portal' },
                    ],
                },
            ],
        },
    },
    {
        id: 'de_franchise_tax',
        label: 'Delaware Franchise Tax',
        icon: 'ph-calendar-check',
        desc: 'Annual Delaware franchise tax for C-Corps. Due March 1.',
        required: true,
        process: {
            title: 'Pay Delaware Franchise Tax',
            pick: null,
            tracks: [
                {
                    label: 'Online at Delaware eCorp',
                    time: 'Immediate payment / due March 1',
                    cost: 'Minimum $175 (Authorized Shares Method) or $400 (Assumed Par Value Method) + $50 mandatory Annual Report fee.',
                    steps: [
                        { action: 'Delaware offers two calculation methods. Choose the lower result.' },
                        { action: 'Authorized Shares Method: $175 for 1–5,000 shares, $250 for 5,001–10,000, $85 per additional 10,000 shares above 10,000.' },
                        { action: 'Assumed Par Value Method: divide gross assets by issued shares to get assumed par value, then multiply total authorized shares × assumed par value × 0.004%. Minimum $400.' },
                        { action: 'For a startup with 10M authorized shares at $0.0001 par and $500K assets: the Assumed Par Value method typically yields far less than the Authorized Shares method. Calculate both before paying.' },
                        { action: 'Pay online at the Delaware payment portal plus the mandatory $50 Annual Report fee.', url: 'https://corp.delaware.gov/paytaxes/', cta: 'Pay Delaware taxes' },
                        { action: 'Pay by March 1. Late payments incur a $200 penalty plus 1.5% monthly interest.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'banking',
        label: 'Business Bank Account',
        icon: 'ph-bank',
        desc: 'US business bank account for your corporation.',
        required: false,
        process: {
            title: 'Open a US business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'Mercury (startup-friendly)',
                    time: '1–3 business days',
                    cost: 'Free. No minimum, no monthly fees.',
                    steps: [
                        { action: 'Apply online. Accepts C-Corps and international founders.', url: 'https://mercury.com', cta: 'Mercury bank' },
                        { action: 'Provide: Certificate of Incorporation, EIN, Bylaws, government ID for all owners over 25%.' },
                    ],
                },
                {
                    label: 'Brex (VC-backed startups)',
                    time: '1–2 business days',
                    cost: 'Free. Gives a corporate credit card with no personal guarantee.',
                    steps: [
                        { action: 'Brex is built for funded startups. Recommended if you\'re raising.', url: 'https://www.brex.com', cta: 'Brex' },
                        { action: 'Provide: Certificate of Incorporation, EIN, cap table.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'founder_docs',
        label: 'Founder Agreement',
        icon: 'ph-user-list',
        desc: 'Signed founder agreement covering vesting, IP assignment, and co-founder terms.',
        required: true,
        templateUrl: 'https://onboardin.llc/templates/founder-agreement-v1.pdf',
        process: {
            title: 'Draft and sign your Founder Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1–2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin Founder Agreement template.', url: 'https://onboardin.llc/templates/founder-agreement-v1.pdf', cta: 'Download template' },
                        { action: 'Coordinate with your Stock Purchase Agreement — the vesting terms must match.' },
                        { action: 'Ensure IP assignment covers all prior work and inventions related to the company\'s business.' },
                        { action: 'All founders sign. Upload here.' },
                    ],
                },
            ],
        },
    },
];

// ─── US WYOMING LLC ───────────────────────────────────────────────────────────

export const US_WY_LLC = [
    {
        id: 'gov_id',
        label: 'Government ID',
        icon: 'ph-identification-card',
        desc: 'Valid photo ID for all members.',
        required: true,
        process: {
            title: 'Government ID',
            pick: 'Any one accepted:',
            tracks: [
                { label: 'Passport', time: 'Varies', cost: 'Varies', steps: [{ action: 'Use your existing valid passport.' }] },
                { label: "Driver's License / National ID", time: 'Varies', cost: 'Varies', steps: [{ action: 'Current government-issued photo ID is accepted.' }] },
            ],
        },
    },
    {
        id: 'registered_agent',
        label: 'Wyoming Registered Agent',
        icon: 'ph-map-pin',
        desc: 'Physical Wyoming address required. PO boxes not accepted.',
        required: true,
        process: {
            title: 'Appoint a Wyoming Registered Agent',
            pick: null,
            tracks: [
                {
                    label: 'Northwest Registered Agent ($125/yr)',
                    time: 'Instant',
                    cost: '$125/year',
                    steps: [
                        { action: 'Go to Northwest Registered Agent and select Wyoming.', url: 'https://www.northwestregisteredagent.com', cta: 'Northwest' },
                        { action: 'You receive a Wyoming street address immediately. No PO boxes allowed by Wyoming law.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'articles',
        label: 'Articles of Organization',
        icon: 'ph-file-text',
        desc: 'Filed with Wyoming Secretary of State. Instant processing online.',
        required: true,
        process: {
            title: 'File Wyoming Articles of Organization',
            pick: null,
            tracks: [
                {
                    label: 'Online at Wyoming Secretary of State (instant)',
                    time: 'Instant to 1 business day online / 15+ business days by mail.',
                    cost: '$102 ($100 state fee + $2 online convenience fee).',
                    steps: [
                        { action: 'Go to the Wyoming Secretary of State WyoBiz portal.', url: 'https://wyobiz.wyo.gov/Business/FilingSearch.aspx', cta: 'WyoBiz portal' },
                        { action: 'Check name availability first. Your name must include "LLC", "L.L.C.", or "Limited Liability Company".' },
                        { action: 'File your Articles of Organization online. Required fields: LLC name, registered agent name and Wyoming street address, member/manager information, and organizer name.' },
                        { action: 'Pay $102 online. Processing is typically instant.' },
                        { action: 'Download your filed Articles. Upload here.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'operating_agreement',
        label: 'Operating Agreement',
        icon: 'ph-handshake',
        desc: 'Internal governance document. Required for banking.',
        required: true,
        templateUrl: 'https://onboardin.llc/templates/llc-operating-agreement.pdf',
        process: {
            title: 'Draft your Wyoming LLC Operating Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1–2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin LLC Operating Agreement template.', url: 'https://onboardin.llc/templates/llc-operating-agreement.pdf', cta: 'Download template' },
                        { action: 'Fill in: member names, ownership percentages, voting rules, and management structure.' },
                        { action: 'All members sign. Do not file with Wyoming — this is a private document.' },
                        { action: 'Upload a signed copy here for your records.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'tax_id',
        label: 'EIN Confirmation',
        icon: 'ph-receipt',
        desc: 'IRS EIN — required for banking and taxes.',
        required: true,
        process: {
            title: 'Get your EIN from the IRS',
            pick: 'Choose your method:',
            tracks: [
                {
                    label: 'Online (US persons — instant)',
                    time: 'Immediate',
                    cost: 'Free',
                    steps: [
                        { action: 'Apply online at the IRS EIN Assistant.', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', cta: 'IRS EIN Assistant' },
                        { action: 'Select "Limited Liability Company" then Wyoming. Complete the form. EIN issued immediately.' },
                        { action: 'Download the CP 575 confirmation letter and upload it here.' },
                    ],
                },
                {
                    label: 'By fax (international founders — 4 business days)',
                    time: '4 business days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download Form SS-4.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/irs/fss4.pdf', cta: 'Download Form SS-4' },
                        { action: 'Write "Foreign" on Line 7b. List a natural person on Line 7a. Fax to +1-304-707-9471.' },
                        { action: 'EIN by fax in 4 business days. Physical CP 575 arrives in 4–6 weeks.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'boi_report',
        label: 'BOI Report (FinCEN)',
        icon: 'ph-shield-check',
        desc: 'Beneficial Ownership — domestic entities currently exempt in 2026.',
        required: false,
        process: {
            title: 'BOI Report',
            pick: null,
            tracks: [
                {
                    label: 'March 2025 IFR — domestic LLCs not reporting companies',
                    time: 'N/A',
                    cost: 'Free',
                    steps: [
                        { action: 'Domestic Wyoming LLCs are not reporting companies under FinCEN\'s March 2025 interim final rule. Monitor for final rule.' },
                        { action: 'Foreign-formed entities operating in the US must file within 30 days.', url: 'https://boiefiling.fincen.gov', cta: 'FinCEN BOI portal' },
                    ],
                },
            ],
        },
    },
    {
        id: 'wy_annual_report',
        label: 'Wyoming Annual Report',
        icon: 'ph-calendar-check',
        desc: 'Annual report and license tax. Due on the 1st of your formation month each year.',
        required: true,
        process: {
            title: 'File Wyoming Annual Report',
            pick: null,
            tracks: [
                {
                    label: 'Online at WyoBiz',
                    time: 'Due the 1st day of your formation anniversary month',
                    cost: '$62 minimum ($60 license tax + $2 online fee). Higher if assets exceed $300,000.',
                    steps: [
                        { action: 'Log in to the Wyoming Secretary of State WyoBiz portal.', url: 'https://wyobiz.wyo.gov', cta: 'WyoBiz portal' },
                        { action: 'File before the 1st of your formation anniversary month. A 60-day late period applies with no penalty; after 60 days, Wyoming may administratively dissolve your LLC.' },
                        { action: 'Fee: $62 minimum (up to $300K in assets). Over $300K: $0.0002 per dollar of assets.' },
                        { action: 'Report member/manager information and confirm registered agent. Pay online.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'banking',
        label: 'Business Bank Account',
        icon: 'ph-bank',
        desc: 'US business bank account for your Wyoming LLC.',
        required: false,
        process: {
            title: 'Open a US business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'Mercury (best for international founders)',
                    time: '1–3 business days',
                    cost: 'Free',
                    steps: [
                        { action: 'Apply online. Mercury accepts Wyoming LLCs with international founders.', url: 'https://mercury.com', cta: 'Mercury bank' },
                        { action: 'Provide: Articles of Organization, EIN, Operating Agreement, owner ID.' },
                    ],
                },
                {
                    label: 'Relay',
                    time: '2–4 business days',
                    cost: 'Free',
                    steps: [
                        { action: 'Apply at Relay.', url: 'https://relayfi.com', cta: 'Relay bank' },
                        { action: 'Provide: Articles, EIN, Operating Agreement, owner ID.' },
                    ],
                },
            ],
        },
    },
    {
        id: 'founder_docs',
        label: 'Founder Agreement',
        icon: 'ph-user-list',
        desc: 'Signed founder agreement covering equity, vesting, and IP assignment.',
        required: true,
        templateUrl: 'https://onboardin.llc/templates/founder-agreement-v1.pdf',
        process: {
            title: 'Draft and sign your Founder Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1–2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the template.', url: 'https://onboardin.llc/templates/founder-agreement-v1.pdf', cta: 'Download template' },
                        { action: 'Fill in: equity splits, vesting schedule, IP assignment, and role definitions.' },
                        { action: 'All founders sign. Upload here.' },
                    ],
                },
            ],
        },
    },
];

// ─── LOOKUP TABLE ─────────────────────────────────────────────────────────────
// Wire-back: import this in App.jsx and replace getDocCategories() internals.
// Key format: `${country}__${entityType}` (double underscore to avoid collision with country names containing spaces)

export const PROCEDURE_LIBRARY = {
    'Jamaica__Ltd':     JAMAICA_LTD,
    'Jamaica__LLC':     JAMAICA_LTD,   // treat similarly for now
    'United States__LLC':    US_DE_LLC,
    'United States__C-Corp': US_DE_CCORP,
    'United States__S-Corp': US_DE_LLC,   // same formation steps; S-Corp is a tax election
    'Wyoming__LLC':     US_WY_LLC,
    'Delaware__LLC':    US_DE_LLC,
    'Delaware__C-Corp': US_DE_CCORP,
};

/**
 * getCategories(country, entityType, jurisdiction)
 * Drop-in replacement for getDocCategories() in App.jsx.
 * Falls back to base set if jurisdiction not in library.
 */
export function getCategories(country, entityType, jurisdiction) {
    const key = `${country}__${entityType}`;
    const jurisdictionKey = jurisdiction ? `${jurisdiction}__${entityType}` : null;
    return PROCEDURE_LIBRARY[jurisdictionKey] || PROCEDURE_LIBRARY[key] || [];
}
