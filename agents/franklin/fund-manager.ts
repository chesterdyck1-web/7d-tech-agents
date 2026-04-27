// Manages three fund buckets: operating capital, acquisition fund, real estate fund.
// Operating capital absorbs monthly COGS first. Net surplus is split between the two growth funds.
// Target: operating capital holds 3 months of COGS as a buffer.

export interface FundSnapshot {
  operatingFundCad: number;
  acquisitionFundCad: number;
  realEstateFundCad: number;
  monthsOfRunway: number;
  surplusThisMonth: number;
}

const OPERATING_BUFFER_MONTHS = 3;
const ACQUISITION_FUND_SHARE = 0.40; // 40% of surplus
const REAL_ESTATE_FUND_SHARE = 0.60; // 60% of surplus

// Compute fund balances from revenue and cost data.
// This is a projection model — real balances are held outside the system.
// Chester can override baseline balances by updating the Fund Balances sheet.
export function computeFunds(
  mrrCad: number,
  monthlyCogsCAD: number,
  existingOperatingCad: number,
  existingAcquisitionCad: number,
  existingRealEstateCad: number
): FundSnapshot {
  const operatingBuffer = monthlyCogsCAD * OPERATING_BUFFER_MONTHS;
  const surplusThisMonth = mrrCad - monthlyCogsCAD;

  let operatingFundCad = existingOperatingCad;
  let acquisitionFundCad = existingAcquisitionCad;
  let realEstateFundCad = existingRealEstateCad;

  if (surplusThisMonth > 0) {
    // Top up operating fund to buffer target first
    const operatingDeficit = Math.max(0, operatingBuffer - operatingFundCad);
    const toOperating = Math.min(surplusThisMonth, operatingDeficit);
    const remainder = surplusThisMonth - toOperating;

    operatingFundCad += toOperating;
    acquisitionFundCad += remainder * ACQUISITION_FUND_SHARE;
    realEstateFundCad += remainder * REAL_ESTATE_FUND_SHARE;
  } else {
    // Negative surplus: draw from operating fund
    operatingFundCad = Math.max(0, operatingFundCad + surplusThisMonth);
  }

  const monthsOfRunway =
    monthlyCogsCAD > 0 ? operatingFundCad / monthlyCogsCAD : 999;

  return {
    operatingFundCad: Math.round(operatingFundCad * 100) / 100,
    acquisitionFundCad: Math.round(acquisitionFundCad * 100) / 100,
    realEstateFundCad: Math.round(realEstateFundCad * 100) / 100,
    monthsOfRunway: Math.round(monthsOfRunway * 10) / 10,
    surplusThisMonth: Math.round(surplusThisMonth * 100) / 100,
  };
}
