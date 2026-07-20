import { legalTemplateUrl } from './template-urls.js';
import { JAMAICA_LTD } from '../data/procedures/jamaica-ltd.js';
import { US_DE_LLC } from '../data/procedures/us-de-llc.js';
import { US_DE_CCORP } from '../data/procedures/us-de-c-corp.js';
import { US_WY_LLC } from '../data/procedures/us-wy-llc.js';

export { JAMAICA_LTD, US_DE_LLC, US_DE_CCORP, US_WY_LLC };

/**
 * Onboardin Procedure Library v1
 *
 * Researched jurisdiction procedures live in src/data/procedures/*.js.
 * This module keeps slug resolution, getters, and generic fallbacks.
 *
 * Last researched: 2026-06-04. Fees verified against official sources.
 */

// ─── LOOKUP TABLE ─────────────────────────────────────────────────────────────
// Key format: `${country}__${entityType}` (double underscore to avoid collision with country names containing spaces)

/** Map signup/profile entity labels to procedure library keys. */
export function normalizeEntityType(entityType) {
    if (!entityType) return entityType;
    const t = String(entityType).trim();
    if (t === 'Limited Company (Ltd)' || t === 'Limited Company') return 'Ltd';
    return t;
}

/** User-facing label for canonical entity_type stored in clients. */
export function displayEntityType(entityType) {
    const canonical = normalizeEntityType(entityType);
    if (canonical === 'Ltd') return 'Limited Company (Ltd)';
    return entityType || canonical || '';
}

export function isJamaicaProfile(country, jurisdiction) {
    return country === 'Jamaica' || jurisdiction === 'Jamaica';
}

/** Signup / profile picker: value is canonical, label is friendly. */
export const ENTITY_TYPE_OPTIONS = [
    { value: 'LLC', label: 'LLC' },
    { value: 'C-Corp', label: 'C-Corp' },
    { value: 'S-Corp', label: 'S-Corp' },
    { value: 'Ltd', label: 'Limited Company (Ltd)' },
    { value: 'PLC', label: 'PLC' },
    { value: 'Sole Proprietor', label: 'Sole Proprietor' },
    { value: 'Non-Profit', label: 'Non-Profit' },
    { value: 'Partnership', label: 'Partnership' },
];

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
 * Returns the researched procedure set for combos in PROCEDURE_LIBRARY;
 * callers fall back to getGenericCategories for everything else.
 */
export function getCategories(country, entityType, jurisdiction) {
    const entity = normalizeEntityType(entityType);
    const key = `${country}__${entity}`;
    const jurisdictionKey = jurisdiction ? `${jurisdiction}__${entity}` : null;
    return PROCEDURE_LIBRARY[jurisdictionKey] || PROCEDURE_LIBRARY[key] || [];
}

/**
 * Generic fallback categories for jurisdiction/entity combos not in PROCEDURE_LIBRARY
 * (other countries, sole proprietors, partnerships, PLCs).
 */
export function getGenericCategories(entityType, country, jurisdiction) {
    const isJamaica = country === 'Jamaica' || jurisdiction === 'Jamaica';
    const isUS = !isJamaica && (country === 'United States' || jurisdiction === 'Delaware' || jurisdiction === 'Wyoming');
    const isCA = country === 'Canada';

    const isJM = isJamaica;

    const base = [
        {
            id: 'gov_id',
            label: 'Government ID',
            icon: 'ph-identification-card',
            desc: 'Passport or government-issued photo ID for each founder.',
            required: true,
            process: isJM ? {
                title: 'Get your Government ID',
                pick: 'Pick the fastest option for you:',
                tracks: [
                    {
                        label: 'Passport (recommended)',
                        time: '7 days standard, same-day available',
                        cost: '$6,500 JMD standard / $21,500 JMD same-day',
                        steps: [
                            { action: 'Go to the PICA online portal or visit their Kingston office at 25 Constant Spring Road.', url: 'https://www.pica.gov.jm', cta: 'Open PICA website' },
                            { action: 'Bring: birth certificate, 2 passport photos, valid ID (e.g., driver\'s license or old passport), and payment.' },
                            { action: 'Choose "New Application" if first passport, or "Renewal" if renewing. Pay at counter.' },
                            { action: 'Collect in 7 working days (standard) or same-day if submitted by 11 AM at head office.' },
                        ],
                    },
                    {
                        label: "Voter's ID (free, slower)",
                        time: '3 to 6 months',
                        cost: 'Free',
                        steps: [
                            { action: 'Register online at the Electoral Office of Jamaica portal or visit your parish office.', url: 'https://www.eoj.com.jm', cta: 'Open EOJ website' },
                            { action: 'Bring: birth certificate and proof of address (utility bill or bank statement).' },
                            { action: 'Complete the registration form. ID is mailed to your address within 3 to 6 months.' },
                            { action: 'Apply immediately. This takes time. Use your passport if you need ID sooner.' },
                        ],
                    },
                ],
            } : {
                title: 'Government ID',
                pick: 'Any one of these is accepted:',
                tracks: [
                    { label: 'Passport', time: 'Varies by country', cost: 'Varies', steps: [{ action: 'Use your existing passport, or apply at your national passport authority.' }] },
                    { label: "Driver's License", time: 'Varies', cost: 'Varies', steps: [{ action: 'A current government-issued driver\'s license with photo is accepted.' }] },
                    { label: 'National ID', time: 'Varies', cost: 'Often free', steps: [{ action: 'A government-issued national identity card is accepted.' }] },
                ],
            }
        },
        {
            id: 'founder_docs',
            label: 'Founder Documents',
            icon: 'ph-user-list',
            desc: 'Signed founder agreement covering equity, vesting, IP, and dispute resolution.',
            required: true,
            templateUrl: legalTemplateUrl('founder_agreement'),
            fillEnabled: true,
            process: {
                title: 'Draft and sign your Founder Agreement',
                pick: null,
                tracks: [
                    {
                        label: 'Using our template',
                        time: '1 to 2 days',
                        cost: 'Free',
                        steps: [
                            { action: 'Download the Onboardin Founder Agreement template.', url: legalTemplateUrl('founder_agreement'), cta: 'Download template' },
                            { action: 'Fill in: each founder\'s full legal name, equity percentage, vesting schedule (4-year / 1-year cliff recommended), and role.' },
                            { action: 'Review the IP assignment clause. It must state all work done for the company belongs to the company.' },
                            { action: isJM ? 'Add a shotgun clause for dispute resolution. This lets any founder buy out the other at a set price to break deadlocks.' : 'Add a buyout or deadlock clause so disputes have a defined resolution path.' },
                            { action: 'All founders sign the document. Have signatures witnessed if possible.' },
                        ],
                    },
                ],
            }
        },
    ];

    if (entityType === 'LLC' || entityType === 'C-Corp' || entityType === 'S-Corp' || (isJM && entityType === 'Ltd')) {
        base.push({
            id: 'articles',
            label: isJM ? 'Certificate of Incorporation' : (entityType === 'LLC' ? 'Articles of Organization' : 'Articles of Incorporation'),
            icon: 'ph-file-text',
            desc: isJM ? 'Certificate of Incorporation from the Companies Office of Jamaica.' : (entityType === 'LLC' ? 'State-issued articles of organization.' : 'State-issued articles of incorporation.'),
            required: false,
            process: isJM ? {
                title: 'Incorporate at the Companies Office of Jamaica',
                pick: null,
                tracks: [
                    {
                        label: 'COJ Standard (4 to 6 days)',
                        time: '4 to 6 working days',
                        cost: '~$28,000 JMD (registration + stamp duty)',
                        steps: [
                            { action: 'Search your proposed company name at the COJ to confirm availability. Reserve it using Form 6 (J$3,000 JMD, holds name 90 days).', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-6.pdf', cta: 'Download Form 6', portalUrl: 'https://www.orcjamaica.com', portalCta: 'COJ portal' },
                            { action: 'Download and complete the BRF1 "Super Form". This single form registers your company AND handles NIS and GCT registration automatically.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/brf1.pdf', cta: 'Download BRF1', portalUrl: 'https://www.orcjamaica.com/Forms.aspx', portalCta: 'COJ forms portal' },
                            { action: 'Gather: TRN for all directors and shareholders, valid ID for each, proof of registered address, and the completed Form 1A (Articles of Incorporation).', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-1a.pdf', cta: 'Download Form 1A' },
                            { action: 'Submit the Beneficial Ownership Return (BOR) forms: Form A for individuals, Form B for corporate shareholders. Required by law.', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/coj/form-a.pdf', cta: 'Download Form A (BOR)' },
                            { action: 'Submit all forms at the COJ office (14 Camp Road, Kingston) or via their online portal. Pay the fee at the counter. Same-day processing if submitted before 11 AM.' },
                            { action: 'Receive your Certificate of Incorporation (typically 4 to 6 days standard). Upload it here.' },
                        ],
                    },
                ],
            } : {
                title: entityType === 'LLC' ? 'File Articles of Organization' : 'File Articles of Incorporation',
                pick: null,
                tracks: [
                    {
                        label: 'Already formed',
                        time: 'N/A',
                        cost: 'N/A',
                        steps: [{ action: 'Upload your state-issued articles document below.' }],
                    },
                    {
                        label: 'Not yet formed',
                        time: 'Varies by state',
                        cost: 'Varies by state',
                        steps: [{ action: 'Your Navigator will file this for you as part of your onboarding. No action needed yet.' }],
                    },
                ],
            }
        });
        base.push({
            id: 'operating_agreement',
            label: isJM ? 'Shareholders Agreement' : (entityType === 'LLC' ? 'Operating Agreement' : 'Bylaws / Shareholder Agreement'),
            icon: 'ph-handshake',
            desc: isJM ? 'Private shareholders agreement defining transfer restrictions and reserved matters.' : 'Internal governance document outlining ownership and management structure.',
            required: false,
            templateUrl: isJM ? legalTemplateUrl('jm_shareholders_agreement') : (entityType === 'LLC' ? legalTemplateUrl('llc_operating_agreement') : legalTemplateUrl('corp_bylaws')),
            fillEnabled: true,
            process: isJM ? {
                title: 'Draft your Shareholders Agreement',
                pick: null,
                tracks: [
                    {
                        label: 'Using our template',
                        time: '1 to 3 days',
                        cost: 'Free (template) or $50,000+ JMD with an attorney',
                        steps: [
                            { action: 'Download the Onboardin Shareholders Agreement template.', url: legalTemplateUrl('jm_shareholders_agreement'), cta: 'Download template' },
                            { action: 'Define transfer restrictions: include a Right of First Refusal so shares cannot be sold to outside parties without offering existing shareholders first.' },
                            { action: 'List your Reserved Matters. Decisions requiring 75% or 100% board approval, such as taking on debt, issuing new shares, or selling the company.' },
                            { action: 'Add drag-along and tag-along rights to protect minority shareholders in an acquisition.' },
                            { action: 'All shareholders sign the agreement. This document is private. Do not file it with the COJ.' },
                        ],
                    },
                ],
            } : {
                title: entityType === 'LLC' ? 'Draft your Operating Agreement' : 'Draft your Bylaws',
                pick: null,
                tracks: [
                    {
                        label: 'Using our template',
                        time: '1 to 2 days',
                        cost: 'Free',
                        steps: [
                            { action: 'Download and complete the template.', url: entityType === 'LLC' ? legalTemplateUrl('llc_operating_agreement') : legalTemplateUrl('corp_bylaws'), cta: 'Download template' },
                            { action: 'Fill in member names, ownership percentages, voting rules, and management structure.' },
                            { action: 'All members/directors sign the document.' },
                        ],
                    },
                ],
            }
        });
    }

    if (entityType === 'Non-Profit') {
        base.push({
            id: 'nonprofit_docs',
            label: 'Non-Profit Formation Docs',
            icon: 'ph-certificate',
            desc: 'Articles of incorporation, bylaws, and board member list.',
            required: false,
        });
    }

    if (isJamaica) {
        base.push({
            id: 'personal_trn',
            label: 'Personal TRN',
            icon: 'ph-receipt',
            desc: 'Taxpayer Registration Number required for all directors before incorporation.',
            required: true,
            process: {
                title: 'Get your personal TRN',
                pick: null,
                tracks: [
                    {
                        label: 'In person at TAJ (same-day, free)',
                        time: 'Same day',
                        cost: 'Free',
                        steps: [
                            { action: 'Go to any Tax Administration Jamaica office. Locate the TRN desk.', url: 'https://www.jamaicatax.gov.jm', cta: 'Find TAJ offices' },
                            { action: 'Bring: valid Passport OR Driver\'s License. If you have neither: Voter\'s ID plus Birth Certificate.' },
                            { action: 'Complete Form 1 (Application for Taxpayer Registration, Individuals). Provided at the counter at no charge.' },
                            { action: 'Your TRN is issued the same day. Record it. Every subsequent step requires it.' },
                        ],
                    },
                    {
                        label: 'Overseas / by mail (2 to 5 weeks)',
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
        });
        base.push({
            id: 'jam_brc',
            label: 'BRC / Tax Compliance Certificate',
            icon: 'ph-certificate',
            desc: 'Business Registration Certificate and Tax Compliance Certificate. Issued automatically on COJ incorporation.',
            required: true,
            templateUrl: 'https://www.orcjamaica.com/forms/',
            process: {
                title: 'Get and maintain your BRC and TCC',
                pick: null,
                tracks: [
                    {
                        label: 'Initial issuance (automatic with COJ filing)',
                        time: 'Issued with Certificate of Incorporation',
                        cost: 'Included in COJ incorporation fee (~J$28,000)',
                        steps: [
                            { action: 'Your BRC and initial 90-day TCC are issued automatically when COJ processes your BRF1 Super Form. No separate application.' },
                            { action: 'Find your company TRN on the COJ confirmation letter. Record it. Required for banking and all tax filings.' },
                            { action: 'Upload your BRC or Certificate of Incorporation here.' },
                        ],
                    },
                    {
                        label: 'TCC renewal (every 90 days, free)',
                        time: 'Same day online / 2 to 7 days in person',
                        cost: 'Free',
                        steps: [
                            { action: 'Log in to the TAJ eServices portal with your company TRN.', url: 'https://www.jamaicatax.gov.jm', cta: 'Open TAJ portal' },
                            { action: 'TAJ now auto-renews TCCs electronically for compliant taxpayers. Check if renewal happened automatically before visiting in person.' },
                            { action: 'If auto-renewal failed: ensure all statutory deductions (NIS, NHT, HEART) are paid and filed. TAJ verifies electronically. No clearance letters required since 2024.' },
                            { action: 'Submit digital TCC renewal if auto-renewal did not trigger. Same-day online, or 2 to 7 days via branch.' },
                            { action: 'Download your renewed TCC and upload it here. Banks require a current TCC.' },
                        ],
                    },
                ],
            },
        });
        base.push({
            id: 'nis_nht_heart',
            label: 'NIS / NHT / HEART Registration',
            icon: 'ph-users-three',
            desc: 'Statutory employer registrations. Automatic via BRF1 Super Form at incorporation.',
            required: true,
            process: {
                title: 'Employer statutory registrations',
                pick: null,
                tracks: [
                    {
                        label: 'Via BRF1 Super Form (if incorporating now)',
                        time: 'Included with COJ filing',
                        cost: 'Free. Part of COJ process',
                        steps: [
                            { action: 'The BRF1 Super Form handles NIS, NHT, and HEART registration simultaneously when you incorporate at COJ. No separate applications needed.' },
                            { action: 'Confirm your NIS Employer Reference Number appears in your COJ confirmation documents. If missing, contact MLSS.', url: 'https://www.mlss.gov.jm', cta: 'MLSS contact' },
                            { action: 'Confirm NHT registration via the NHT Employer Portal. Your company TRN is the login.', url: 'https://www.nht.gov.jm/employers', cta: 'NHT portal' },
                            { action: 'HEART registration triggers automatically once monthly payroll exceeds J$14,444. No advance application needed.' },
                        ],
                    },
                    {
                        label: 'Separate registration (existing company or missed in BRF1)',
                        time: '2 to 5 working days per agency',
                        cost: 'Free',
                        steps: [
                            { action: 'NIS: Complete Form R1 (Employer/Business Registration). Bring Certificate of Incorporation, company TRN, valid ID for all directors.', url: 'https://www.mlss.gov.jm', cta: 'Download Form R1' },
                            { action: 'NHT: Apply at the NHT Employer Portal or any NHT branch. Bring Certificate of Incorporation and company TRN.', url: 'https://www.nht.gov.jm/employers', cta: 'NHT portal' },
                            { action: 'File monthly statutory remittances using Form S01 on TAJ eServices for all three (NIS + NHT + HEART in one submission).', url: 'https://www.jamaicatax.gov.jm', cta: 'TAJ eServices' },
                        ],
                    },
                ],
            },
        });
        base.push({
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
                        label: 'Online at TAJ eServices',
                        time: 'Same day (near-instant)',
                        cost: 'Free',
                        steps: [
                            { action: 'GCT is mandatory once annual gross turnover exceeds J$15,000,000. You must register within 21 days of crossing the threshold. Voluntary registration is permitted below it.' },
                            { action: 'Log in to the TAJ eServices portal and navigate to GCT Registration.', url: 'https://www.jamaicatax.gov.jm', cta: 'TAJ eServices' },
                            { action: 'Complete Form GCT-1. Provide: company TRN, Certificate of Incorporation, financial records proving threshold breach, and director IDs.' },
                            { action: 'Once registered, file and remit GCT monthly. Standard GCT rate is 15%.' },
                        ],
                    },
                ],
            },
        });
        base.push({
            id: 'coj_annual_return',
            label: 'COJ Annual Return',
            icon: 'ph-calendar-check',
            desc: 'Annual return filed with the Companies Office of Jamaica. J$5,000 fee. Late: J$100/day.',
            required: true,
            process: {
                title: 'File your Annual Return with COJ',
                pick: null,
                tracks: [
                    {
                        label: 'Online or in person at COJ',
                        time: '~10 working days standard / same-day for extra J$1,500 to 4,000',
                        cost: 'J$5,000 standard. Late fee: J$100/day up to J$10,000 maximum.',
                        steps: [
                            { action: 'File within 42 days of your company financial year end. Failure triggers J$100/day in penalties, capped at J$10,000.' },
                            { action: 'Complete Form 19A (Profit-Making Company Annual Return).', url: 'https://www.orcjamaica.com', cta: 'COJ portal' },
                            { action: 'Attach an updated Beneficial Ownership Return (BOR). Use Form A for individuals, Form B for corporate shareholders. Required every year since 2023.' },
                            { action: 'Pay J$5,000 at the COJ counter or online. Request same-day processing for an additional J$1,500 to 4,000 if you need the stamped return quickly.' },
                            { action: 'Retain the COJ-stamped Form 19A. Banks and government agencies may request it.' },
                        ],
                    },
                ],
            },
        });
    }

    if (isUS || isCA) {
        base.push({
            id: 'registered_agent',
            label: 'Registered Agent',
            icon: 'ph-map-pin',
            desc: 'Required physical state address to receive legal documents on behalf of your company.',
            required: true,
            process: isUS ? {
                title: 'Appoint a Registered Agent',
                pick: null,
                tracks: [
                    {
                        label: 'Northwest Registered Agent ($125/yr)',
                        time: 'Instant',
                        cost: '$125/year',
                        steps: [
                            { action: 'Go to Northwest Registered Agent and select your state of formation.', url: 'https://www.northwestregisteredagent.com', cta: 'Northwest Registered Agent' },
                            { action: 'Purchase the registered agent service. You receive a state street address immediately.' },
                            { action: 'Use this address as your Registered Agent address on your formation documents.' },
                        ],
                    },
                    {
                        label: 'ZenBusiness ($199/yr, includes filing)',
                        time: 'Instant',
                        cost: '$199/year',
                        steps: [
                            { action: 'ZenBusiness handles both registered agent service and the state formation filing.', url: 'https://www.zenbusiness.com', cta: 'ZenBusiness' },
                        ],
                    },
                ],
            } : null,
        });
        base.push({
            id: 'tax_id',
            label: isUS ? 'EIN Confirmation' : 'Business Number (CRA)',
            icon: 'ph-receipt',
            desc: isUS ? 'IRS Employer Identification Number. Required for banking and tax filings.' : 'Canada Revenue Agency business number confirmation.',
            required: true,
            templateUrl: isUS ? 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/irs/fss4.pdf' : 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/registering-your-business/bro-how-register.html',
            process: isUS ? {
                title: 'Get your EIN from the IRS',
                pick: 'Choose your method:',
                tracks: [
                    {
                        label: 'Online (US persons with SSN, instant)',
                        time: 'Immediate',
                        cost: 'Free',
                        steps: [
                            { action: 'Go to the IRS EIN Assistant. Available Monday to Friday 7am to 10pm ET.', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online', cta: 'IRS EIN Assistant' },
                            { action: 'Select your entity type (LLC or Corporation) and state of formation.' },
                            { action: 'Enter the responsible party\'s SSN or ITIN and complete the form. EIN displayed immediately.' },
                            { action: 'Download the CP 575 confirmation letter and upload it here.' },
                        ],
                    },
                    {
                        label: 'By fax (international founders, 4 business days)',
                        time: '4 business days',
                        cost: 'Free',
                        steps: [
                            { action: 'Download Form SS-4 (Rev. Dec 2025 or later).', url: 'https://qatfiicpkunabpphwqee.supabase.co/storage/v1/object/public/public-forms/irs/fss4.pdf', cta: 'Download Form SS-4' },
                            { action: 'On Line 7b write "Foreign" (no SSN). Line 7a must be a natural person\'s name as the Responsible Party.' },
                            { action: 'Fax the completed form to: +1-304-707-9471 (International fax line). Include a return fax number on your cover sheet.' },
                            { action: 'EIN arrives by fax within 4 business days. Physical CP 575 letter arrives by mail in 4 to 6 weeks. Upload whichever you receive first.' },
                        ],
                    },
                    {
                        label: 'By phone (international founders, immediate)',
                        time: 'Immediate during the call',
                        cost: 'Free',
                        steps: [
                            { action: 'Call the IRS international EIN line: +1-267-941-1099. Monday to Friday 6am to 11pm ET.' },
                            { action: 'Have your completed Form SS-4 in front of you. The agent will ask for information on the form and issue your EIN verbally.' },
                            { action: 'Write down the EIN immediately. CP 575 confirmation arrives by mail in 4 to 6 weeks.' },
                        ],
                    },
                ],
            } : null,
        });
        base.push({
            id: 'boi_report',
            label: 'BOI Report (FinCEN)',
            icon: 'ph-shield-check',
            desc: 'Beneficial Ownership Information. Domestic U.S.-formed entities exempt under March 2025 IFR.',
            required: false,
            process: isUS ? {
                title: 'Beneficial Ownership Information (BOI) Report',
                pick: null,
                tracks: [
                    {
                        label: 'March 2025 IFR. Domestic US entities not reporting companies',
                        time: 'N/A for domestic entities',
                        cost: 'Free',
                        steps: [
                            { action: 'Domestic U.S.-formed LLCs and C-Corps are not reporting companies under FinCEN\'s March 2025 interim final rule. Monitor fincen.gov/boi for the final rule.' },
                            { action: 'Foreign-formed entities registered to do business in the US must file within 30 days of registration.', url: 'https://boiefiling.fincen.gov', cta: 'FinCEN BOI portal' },
                        ],
                    },
                ],
            } : null,
        });
        if (entityType === 'LLC' || entityType === 'S-Corp') {
            base.push({
                id: 'us_annual_tax',
                label: jurisdiction === 'Wyoming' ? 'Wyoming Annual Report' : 'Delaware Annual Franchise Tax',
                icon: 'ph-calendar-check',
                desc: jurisdiction === 'Wyoming'
                    ? 'Annual report and $62 license tax. Due on your formation anniversary month each year.'
                    : 'Flat $300/year Delaware LLC tax. Due June 1. No report form required.',
                required: true,
                process: {
                    title: jurisdiction === 'Wyoming' ? 'File Wyoming Annual Report' : 'Pay Delaware LLC Annual Tax',
                    pick: null,
                    tracks: [
                        jurisdiction === 'Wyoming' ? {
                            label: 'Online at WyoBiz',
                            time: 'Due 1st of your formation anniversary month',
                            cost: '$62 minimum ($60 tax + $2 online fee). Over $300K in assets: $0.0002 per dollar.',
                            steps: [
                                { action: 'Log in to the Wyoming Secretary of State WyoBiz portal.', url: 'https://wyobiz.wyo.gov', cta: 'WyoBiz portal' },
                                { action: 'File before the 1st of your formation anniversary month. A 60-day grace period applies with no penalty; after 60 days, Wyoming may dissolve your LLC.' },
                                { action: 'Report member/manager information and confirm your registered agent. Pay $62 minimum online.' },
                            ],
                        } : {
                            label: 'Online at Delaware eCorp',
                            time: 'Due June 1 annually',
                            cost: '$300/year flat. Increasing to $400 for 2026 tax year (payable 2027).',
                            steps: [
                                { action: 'Delaware LLCs pay a flat annual tax. No annual report form. Payment only.' },
                                { action: 'Pay by June 1 each year at the Delaware payment portal.', url: 'https://corp.delaware.gov/paytaxes/', cta: 'Pay Delaware taxes' },
                                { action: 'Late payments incur a $200 penalty plus 1.5% monthly interest.' },
                            ],
                        },
                    ],
                },
            });
        }
        if (entityType === 'C-Corp') {
            base.push({
                id: 'us_annual_tax',
                label: 'Delaware Franchise Tax',
                icon: 'ph-calendar-check',
                desc: 'Annual Delaware franchise tax for C-Corps. Due March 1. Minimum $225 total.',
                required: true,
                process: {
                    title: 'Pay Delaware Annual Franchise Tax',
                    pick: null,
                    tracks: [
                        {
                            label: 'Online at Delaware eCorp',
                            time: 'Due March 1 annually',
                            cost: 'Min $175 tax (Authorized Shares) or $400 (Assumed Par Value) + $50 mandatory Annual Report fee.',
                            steps: [
                                { action: 'Delaware offers two calculation methods. Pay whichever is lower.' },
                                { action: 'Authorized Shares Method: $175 for 1 to 5,000 shares. $250 for 5,001 to 10,000. $85 per additional 10,000 above that.' },
                                { action: 'Assumed Par Value Method: divide gross assets by issued shares to get assumed par value. Multiply authorized shares × assumed par × 0.004%. Minimum $400.' },
                                { action: 'Most startups with 10M shares at $0.0001 par and under $1M in assets pay the minimum ($175 or $400 depending on method). Calculate both.' },
                                { action: 'Pay online plus the mandatory $50 Annual Report fee.', url: 'https://corp.delaware.gov/paytaxes/', cta: 'Pay Delaware taxes' },
                                { action: 'Deadline: March 1. Late penalty: $200 + 1.5%/month interest.' },
                            ],
                        },
                    ],
                },
            });
        }
    }

    base.push({
        id: 'banking',
        label: 'Banking Details',
        icon: 'ph-bank',
        desc: isJamaica ? 'Business bank account letter or voided cheque from your Jamaican bank.' : isUS ? 'US business bank account, required for accepting payments and filing taxes.' : 'Voided cheque or bank letter confirming your business account.',
        required: false,
        process: isJamaica ? {
            title: 'Open a business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'NCB SME On-The-Go (lowest cost)',
                    time: '5 to 7 working days',
                    cost: 'J$2,000 minimum deposit',
                    steps: [
                        { action: 'Prepare a 12-month Cash Flow Projection and a Board Resolution. The Board Resolution must explicitly state: (1) authorisation to open the account, (2) names of authorised signatories, (3) signing mandate e.g. "any two to sign", and (4) specific authority for NCB e-Link online banking access.', url: 'https://www.jncb.com/Business/SME-Corner/SME-On-The-Go', cta: 'NCB SME page' },
                        { action: 'Submit the online application via the NCB portal and upload digital copies of your BRC, TCC, and IDs for all directors.' },
                        { action: 'Attend an in-branch appointment to sign the Signature Card, FATCA forms, and have original documents physically verified. Bring all originals.' },
                        { action: 'If requested by the branch manager, provide professional reference letters from an Attorney, JP, or Chartered Accountant.' },
                        { action: 'Account number issued in 1 to 3 days. NCB Business Online access takes an additional 3 to 5 days. Download your bank letter and upload it here.' },
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
                        { action: 'A JMMB representative will conduct a mandatory physical site visit to your business premises. Schedule this in advance.' },
                        { action: 'Account approval and JMMB Moneyline online banking credentials arrive within 24 to 48 hours of the site visit. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'Scotiabank Business (USD-friendly)',
                    time: '48 to 72 hours after appointment',
                    cost: 'J$10,000 minimum balance (Chequing). Monthly service charge: J$1,035.',
                    steps: [
                        { action: 'Book a business banking appointment at your nearest Scotiabank branch.', url: 'https://jm.scotiabank.com/business-banking.html', cta: 'Scotiabank Business' },
                        { action: 'Bring: Certificate of Incorporation, Articles of Incorporation, company TRN, directors\' TRNs, and proof of address (utility bill under 6 months old).' },
                        { action: 'Provide two character references. From a Justice of the Peace or another bank.' },
                        { action: 'Bring a Directors\' Resolution authorising the account, listing authorised signatories and signing mandate.' },
                        { action: 'Provide 12 months of bank statements or audited financials.' },
                        { action: 'In-branch signing of Signature Card, Operation of Account Agreement, and Business Services Application. Account active within 48 to 72 hours. Download your bank letter and upload it here.' },
                    ],
                },
            ],
        } : isUS ? {
            title: 'Open a US business bank account',
            pick: 'Choose your bank:',
            tracks: [
                {
                    label: 'Mercury (best for startups and international founders)',
                    time: '1 to 3 business days',
                    cost: 'Free. No minimum balance, no monthly fees.',
                    steps: [
                        { action: 'Apply online at Mercury. No branch visit required. Accepts international founders with a US entity.', url: 'https://mercury.com', cta: 'Mercury bank' },
                        { action: 'Provide: formation documents (Articles / Certificate), EIN confirmation, government ID for all owners over 25%, and Operating Agreement or Bylaws.' },
                        { action: 'Account typically approved in 1 to 3 business days. Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'Relay (great for multi-account cash management)',
                    time: '2 to 4 business days',
                    cost: 'Free. No minimum balance.',
                    steps: [
                        { action: 'Apply at Relay. Supports up to 20 sub-accounts. Useful for separating operating cash, payroll, and tax reserves.', url: 'https://relayfi.com', cta: 'Relay bank' },
                        { action: 'Provide: formation documents, EIN, government ID.' },
                        { action: 'Download your bank letter and upload it here.' },
                    ],
                },
                {
                    label: 'Brex (VC-backed startups)',
                    time: '1 to 2 business days',
                    cost: 'Free. Includes corporate card with no personal guarantee.',
                    steps: [
                        { action: 'Apply at Brex. Built for funded startups. Recommended if you\'re raising or have raised.', url: 'https://www.brex.com', cta: 'Brex' },
                        { action: 'Provide: formation documents, EIN, cap table.' },
                    ],
                },
            ],
        } : null,
    });

    return base;
}
