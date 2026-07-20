import { legalTemplateUrl } from '../../lib/template-urls.js';

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
                    time: '3 to 6 months',
                    cost: 'Free',
                    steps: [
                        { action: 'Register at the Electoral Office of Jamaica portal or your parish office.', url: 'https://www.eoj.com.jm', cta: 'Open EOJ portal' },
                        { action: 'Bring: birth certificate and proof of address (utility bill or bank statement).' },
                        { action: 'Complete the registration form. ID is mailed to your address within 3 to 6 months.' },
                        { action: 'Apply immediately if you choose this route. Use your passport for anything time-sensitive in the meantime.' },
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
                        { action: 'Complete Form 1 (Application for Taxpayer Registration, Individuals). This is provided at the counter at no cost.' },
                        { action: 'Your TRN is issued the same day. Record it. You need it for every subsequent step.' },
                    ],
                },
                {
                    label: 'Overseas / by mail',
                    time: '2 to 5 weeks',
                    cost: 'Free',
                    steps: [
                        { action: 'Download Form 1 from the TAJ website.', url: 'https://www.jamaicatax.gov.jm/documents/10181/11382/form1.pdf', cta: 'Download Form 1' },
                        { action: 'Complete the form. Have your ID notarized by a Notary Public in your country.' },
                        { action: 'Mail the notarized package to: Tax Administration Jamaica, TRN Unit, 101 Old Hope Road, Kingston 6.' },
                        { action: 'TRN is mailed back within 2 to 5 weeks.' },
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
                    label: 'COJ standard process (4 to 6 working days)',
                    time: '4 to 6 working days. Same-day available for extra J$1,500 to 4,000.',
                    cost: '~J$28,000 total (registration fee + stamp duty). Name reservation: J$3,000 JMD.',
                    steps: [
                        { action: 'Search your proposed company name at the COJ to confirm it is available. Reserve it using Form 6 (J$3,000 JMD, holds the name for 90 days).', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-6.pdf', cta: 'Download Form 6', portalUrl: 'https://www.orcjamaica.com', portalCta: 'COJ portal' },
                        { action: 'Download and complete the BRF1 "Super Form". This single form simultaneously registers your company with COJ, TAJ (company TRN + TCC), NIS, NHT, and HEART. You do not file those separately.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/brf1.pdf', cta: 'Download BRF1', portalUrl: 'https://www.orcjamaica.com/Forms.aspx', portalCta: 'COJ forms portal' },
                        { action: 'Complete Form 1A (Articles of Incorporation). Include: proposed company name, registered office address in Jamaica, names and addresses of all directors, and authorized share capital.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-1a.pdf', cta: 'Download Form 1A' },
                        { action: 'Complete the Beneficial Ownership Return (BOR) forms. Use Form A for individual shareholders and Form B for corporate shareholders. Mandatory since 2023.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-a.pdf', cta: 'Download Form A (BOR)' },
                        { action: 'Gather for all directors: valid government ID (passport, driver\'s license, or voter\'s ID), personal TRN, and proof of residential address.' },
                        { action: 'Submit all forms at the COJ office (14 Camp Road, Kingston) or via the online portal. Pay the fee at the counter. Request same-day processing if you need it (submit before 11 AM).' },
                        { action: 'Receive your Certificate of Incorporation (typically 4 to 6 days). Your company TRN and initial 90-day TCC are issued at the same time. Upload your Certificate here.' },
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
                        { action: 'Find your company TRN on the COJ confirmation letter. Record it. You need it for banking and tax filings.' },
                        { action: 'Upload your BRC or Certificate of Incorporation here to confirm receipt.' },
                    ],
                },
                {
                    label: 'TCC renewal (every 90 days)',
                    time: 'Same day online / 2 to 7 days in person',
                    cost: 'Free',
                    steps: [
                        { action: 'Log in to the TAJ eServices portal with your company TRN.', url: 'https://www.jamaicatax.gov.jm', cta: 'Open TAJ portal' },
                        { action: 'TAJ now auto-renews TCCs electronically for compliant taxpayers. Check if your renewal happened automatically before visiting in person.' },
                        { action: 'If auto-renewal failed: ensure all statutory deductions (NIS, NHT, HEART) are paid and filed up to date. TAJ verifies these electronically. No clearance letters required.' },
                        { action: 'Submit the digital TCC renewal application. Approval is typically same day online, or 2 to 7 days via branch visit.' },
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
        desc: 'Statutory employer registrations: NIS, NHT, and HEART Trust.',
        required: true,
        process: {
            title: 'Employer statutory registrations',
            pick: null,
            tracks: [
                {
                    label: 'Via BRF1 Super Form (if incorporating now)',
                    time: '4 to 6 working days (with COJ filing)',
                    cost: 'Free. Included in COJ process',
                    steps: [
                        { action: 'The BRF1 Super Form handles NIS, NHT, and HEART registration automatically when you incorporate. No separate applications needed.' },
                        { action: 'Confirm your NIS Employer Reference Number was included in your COJ confirmation documents. If missing, contact MLSS.', url: 'https://www.mlss.gov.jm', cta: 'MLSS contact' },
                        { action: 'NHT registration is confirmed via the NHT Employer Portal. Your company TRN is the login credential.', url: 'https://www.nht.gov.jm/employers', cta: 'NHT Employer Portal' },
                    ],
                },
                {
                    label: 'Separate registration (existing company)',
                    time: '2 to 5 working days per agency',
                    cost: 'Free',
                    steps: [
                        { action: 'NIS: Complete Form R1 (Employer/Business Registration). Bring Certificate of Incorporation, company TRN, valid ID for all directors.', url: 'https://www.mlss.gov.jm', cta: 'Download Form R1' },
                        { action: 'NHT: Apply at the NHT Employer Portal or any NHT branch. Bring Certificate of Incorporation and company TRN.', url: 'https://www.nht.gov.jm/employers', cta: 'NHT portal' },
                        { action: 'HEART: Registration is automatic once your monthly payroll exceeds J$14,444. No advance application. Liability starts the month you cross the threshold.' },
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
                    time: '~10 working days standard / same-day for J$1,500 to 4,000 surcharge',
                    cost: 'J$5,000 standard. Late fee: J$100/day up to J$10,000 maximum.',
                    steps: [
                        { action: 'File within 42 days of your company\'s financial year end. Failure to file on time triggers J$100/day in penalties.' },
                        { action: 'Complete Form 19A (Profit-Making Company Annual Return). Available at the COJ portal.', url: 'https://www.orcjamaica.com', cta: 'COJ portal' },
                        { action: 'Attach an updated Beneficial Ownership Return (BOR). Required every year since 2023. Use Form A for individuals, Form B for corporates.' },
                        { action: 'Pay J$5,000 at the COJ counter or online. Request same-day processing for an additional J$1,500 to 4,000 if you need the stamped return quickly.' },
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
        templateUrl: legalTemplateUrl('jm_shareholders_agreement'),
        fillEnabled: true,
        process: {
            title: 'Draft your Shareholders Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1 to 3 days',
                    cost: 'Free (template). Attorney review: J$50,000 to 150,000.',
                    steps: [
                        { action: 'Download the Onboardin Shareholders Agreement template.', url: legalTemplateUrl('jm_shareholders_agreement'), cta: 'Download template' },
                        { action: 'Include a Right of First Refusal clause: shares cannot be sold to outside parties without offering existing shareholders first at the same price.' },
                        { action: 'List your Reserved Matters. Decisions requiring 75% or 100% shareholder approval: taking on debt over a threshold, issuing new shares, selling the company.' },
                        { action: 'Add drag-along rights (majority can force minority to sell) and tag-along rights (minority can join any sale on the same terms).' },
                        { action: 'Add a shotgun clause for deadlock resolution: either shareholder can name a price; the other must buy at that price or sell at it. Resolves 50/50 deadlocks.' },
                        { action: 'All shareholders sign the agreement. This document is private. Do not file it with the COJ.' },
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
                    time: '5 to 7 working days',
                    cost: 'J$2,000 minimum opening deposit. Monthly fee varies by account type.',
                    steps: [
                        { action: 'Prepare a 12-month Cash Flow Projection and a Board Resolution. The Board Resolution must state: (1) authorisation to open the account, (2) names of all authorised signatories, (3) signing mandate (e.g. "any two to sign"), (4) specific authority for NCB e-Link online banking access.', url: 'https://www.jncb.com/Business/SME-Corner/SME-On-The-Go', cta: 'NCB SME page' },
                        { action: 'Submit the online application via the NCB portal and upload digital copies of your Certificate of Incorporation, BRC, TCC, and government ID for all directors.' },
                        { action: 'Attend an in-branch appointment to sign the Signature Card, FATCA forms, and have original documents physically verified. Bring all originals. Do not rely on photocopies.' },
                        { action: 'If the branch manager requests it, provide professional reference letters from an Attorney, JP, or Chartered Accountant. One letter per director.' },
                        { action: 'Account number is issued within 1 to 3 days. NCB Business Online access takes a further 3 to 5 days. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'JMMB Business (better for SaaS / ACH)',
                    time: '3 to 5 working days (plus mandatory site visit)',
                    cost: 'J$1,000 minimum deposit. Monthly fee: J$1,035.',
                    steps: [
                        { action: 'Gather Form 23 (List of Directors, from COJ) and prepare a 3-year Cash Flow Projection. JMMB requires this for startup accounts.', url: 'https://jm.jmmb.com/business-banking', cta: 'JMMB Business' },
                        { action: 'Draft a Board Resolution authorising the JMMB relationship. Must include: all authorised signers with specimen signatures, and the Company Seal or Stamp.' },
                        { action: 'Obtain two character references for each director. Eligible referees: Justice of the Peace, Notary Public, Minister of Religion, Lawyer, Medical Doctor, or a JMMB client of over 2 years. No family members.' },
                        { action: 'Complete Business Account Opening Form AOB-032023. Attach BRC, TCC, Articles of Incorporation, Certificate of Incorporation, and proof of address for all signatories.' },
                        { action: 'A JMMB representative will conduct a mandatory physical site visit to your business premises or registered office. Schedule this in advance.' },
                        { action: 'Account approval and JMMB Moneyline online banking credentials arrive within 24 to 48 hours of the site visit. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'Scotiabank Business (USD-friendly)',
                    time: '48 to 72 hours after appointment',
                    cost: 'J$10,000 minimum opening balance (Chequing). Monthly service charge: J$1,035.',
                    steps: [
                        { action: 'Book a business banking appointment at your nearest Scotiabank branch.', url: 'https://jm.scotiabank.com/business-banking.html', cta: 'Scotiabank Business' },
                        { action: 'Bring: Certificate of Incorporation, Articles of Incorporation, company TRN, directors\' TRNs, and proof of address (utility bill under 6 months old).' },
                        { action: 'Provide two character references. From a Justice of the Peace or another bank.' },
                        { action: 'Bring a Directors\' Resolution authorising the account, listing authorised signatories and signing mandate.' },
                        { action: 'Provide 12 months of bank statements or audited financials as financial history.' },
                        { action: 'In-branch signing of Signature Card, Operation of Account Agreement, and Business Services Application. Account active within 48 to 72 hours.' },
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
        templateUrl: legalTemplateUrl('founder_agreement'),
        fillEnabled: true,
        process: {
            title: 'Draft and sign your Founder Agreement',
            pick: null,
            tracks: [
                {
                    label: 'Using the Onboardin template',
                    time: '1 to 2 days',
                    cost: 'Free',
                    steps: [
                        { action: 'Download the Onboardin Founder Agreement template.', url: legalTemplateUrl('founder_agreement'), cta: 'Download template' },
                        { action: 'Fill in: each founder\'s full legal name, equity percentage, vesting schedule (4-year / 1-year cliff is standard), and role.' },
                        { action: 'Review the IP assignment clause. It must state that all work done for the company belongs to the company, not the individual.' },
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

