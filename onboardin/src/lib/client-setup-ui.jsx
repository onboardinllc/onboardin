import React from 'react';
import {
    getCategories as getProcedureCategories,
    getGenericCategories,
    normalizeEntityType,
} from './procedures.js';
import { getComplianceVaultCategories } from './compliance.js';

export const REGIONS = {
    'United States': [
        'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
        'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
        'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
        'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
        'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
        'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
        'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
        'Wisconsin','Wyoming',
    ],
    'Canada': [
        'Alberta','British Columbia','Manitoba','New Brunswick',
        'Newfoundland and Labrador','Northwest Territories','Nova Scotia','Nunavut',
        'Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon',
    ],
    'CARICOM': [
        'Antigua and Barbuda','Bahamas','Barbados','Belize','Dominica','Grenada',
        'Guyana','Haiti','Jamaica','Montserrat','Saint Kitts and Nevis','Saint Lucia',
        'Saint Vincent and the Grenadines','Suriname','Trinidad and Tobago',
    ],
    'Latin America': [
        'Argentina','Bolivia','Brazil','Chile','Colombia','Costa Rica','Cuba',
        'Dominican Republic','Ecuador','El Salvador','Guatemala','Honduras','Mexico',
        'Nicaragua','Panama','Paraguay','Peru','Uruguay','Venezuela',
    ],
};

export function recommendEntity(fundingStage, businessIntent, sellsTo, country) {
    const intent = (businessIntent || '').toLowerCase();
    const sells = (sellsTo || '').toLowerCase();
    const isCaricom = (REGIONS['CARICOM'] || []).includes(country);

    const wantsVC = fundingStage === 'Seed' || fundingStage === 'Series A' || fundingStage === 'Series B+';
    const isEnterprise = sells.includes('enterprise') || sells.includes('b2b') || sells.includes('business');
    const isNonProfit = intent.includes('nonprofit') || intent.includes('non-profit') || intent.includes('charity') || intent.includes('501');

    if (isNonProfit) return { entity: 'Non-Profit', reason: 'Non-profit status enables tax exemption and grant eligibility.' };

    if (isCaricom) {
        if (wantsVC) return { entity: 'PLC', reason: 'Public Limited Companies suit venture-scale businesses in CARICOM jurisdictions.' };
        return { entity: 'Ltd', reason: 'Limited Companies are the standard private structure across CARICOM.' };
    }

    if (wantsVC) return { entity: 'C-Corp', reason: 'C-Corps are the standard for venture-backed companies; VCs and stock options require it.' };
    if (!wantsVC && (fundingStage === 'Pre-Seed' || !fundingStage)) return { entity: 'LLC', jurisdiction_hint: 'Wyoming', reason: 'Wyoming LLC: $100 to form, $60/yr to maintain, no state income tax, no franchise tax. Best low-cost US start for founders not yet raising institutional capital.' };
    if (isEnterprise) return { entity: 'LLC', reason: 'LLCs offer pass-through taxation and flexibility, ideal before a fundraise.' };
    return { entity: 'LLC', reason: 'LLCs are the most common structure for early-stage startups: simple, flexible, founder-friendly.' };
}

export const VaultUploadButton = ({ disabled, onFile, fullWidth }) => (
    <label className={`transition-colors ${disabled ? 'text-gray-600 cursor-not-allowed pointer-events-none' : 'cursor-pointer'} ${fullWidth ? 'inline-flex items-center gap-2 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400 hover:text-purple-300 hover:border-purple-500/30' : 'inline-flex text-gray-400 hover:text-purple-300'}`}>
        <i className="ph ph-upload-simple text-base"></i>
        {fullWidth && <span>Upload document</span>}
        <input type="file" className="hidden" disabled={disabled}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </label>
);

export function getDocCategories(entityType, country, jurisdiction) {
    const entity = normalizeEntityType(entityType);
    const fromModule = getProcedureCategories(country, entity, jurisdiction);
    if (fromModule?.length) return fromModule;
    return getGenericCategories(entity, country, jurisdiction);
}

export function buildBlueprintExtras(blueprint, country, entityType, jurisdiction, baseIds) {
    const procedureById = Object.fromEntries(
        getProcedureCategories(country, normalizeEntityType(entityType), jurisdiction).map((c) => [c.id, c]),
    );
    return (blueprint?.required_documents || [])
        .filter((d) => d.id && !baseIds.has(d.id))
        .map((d) => {
            const full = procedureById[d.id];
            if (full) return { ...full };
            return {
                id: d.id,
                label: d.label,
                icon: 'ph-sparkle',
                desc: d.desc,
                required: false,
                suggested: true,
            };
        });
}
