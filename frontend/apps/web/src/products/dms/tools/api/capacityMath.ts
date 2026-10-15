export type ApplicationType = 
  | 'Home/Appartments' 
  | 'Schools' 
  | 'Commercial' 
  | 'Restaurants' 
  | 'Offices' 
  | 'Hospital' 
  | 'Public Toilet' 
  | 'Industries' 
  | 'Resorts';

export function calculateCapacity(appType: ApplicationType, inputs: any, constants: any) {
  let totalLiters = 0;
  let breakdown = '';

  if (!constants) {
    return { totalLiters: 0, breakdown: 'Constants not loaded.' };
  }

  switch (appType) {
    case 'Home/Appartments':
      const houses = inputs.houses || 0;
      const members = constants.home_avg_members || 4;
      const lts_pp_home = constants.home_lts_pp || 150;
      totalLiters = houses * members * lts_pp_home;
      breakdown = houses + ' houses * ' + members + ' members * ' + lts_pp_home + ' L/person';
      break;

    case 'Schools':
      const schoolOccupancy = inputs.occupancy || 0;
      const lts_pp_school = constants.school_lts_pp || 45;
      totalLiters = schoolOccupancy * lts_pp_school;
      breakdown = schoolOccupancy + ' people * ' + lts_pp_school + ' L/person';
      break;

    case 'Commercial':
      const commercialFootfall = inputs.footfall || 0;
      const lts_pp_comm = constants.commercial_lts_pp || 45;
      totalLiters = commercialFootfall * lts_pp_comm;
      breakdown = commercialFootfall + ' footfall * ' + lts_pp_comm + ' L/person';
      break;

    case 'Restaurants':
      const restaurantFootfall = inputs.footfall || 0;
      const lts_pp_rest = constants.commercial_lts_pp || 45; 
      totalLiters = restaurantFootfall * lts_pp_rest;
      breakdown = restaurantFootfall + ' footfall * ' + lts_pp_rest + ' L/person';
      break;

    case 'Offices':
      const officeFootfall = inputs.footfall || 0;
      const lts_pp_office = constants.commercial_lts_pp || 45; 
      totalLiters = officeFootfall * lts_pp_office;
      breakdown = officeFootfall + ' footfall * ' + lts_pp_office + ' L/person';
      break;

    case 'Hospital':
      const hospType = inputs.hospitalType || 'OPD';
      if (hospType === 'OPD') {
        const opdFootfall = inputs.footfall || 0;
        const opdLts = constants.hosp_opd_lts || 25;
        totalLiters = opdFootfall * opdLts;
        breakdown = 'OPD: ' + opdFootfall + ' footfall * ' + opdLts + ' L/person';
      } else {
        const beds = inputs.beds || 0;
        const ipdLts = constants.hosp_ipd_lts || 400;
        let base = beds * ipdLts;
        breakdown = 'IPD: ' + beds + ' beds * ' + ipdLts + ' L/bed';

        const extraLts = constants.hosp_extra_lts || 25;
        let extraTotal = 0;
        let extras = [];
        if (inputs.dialysis) { extraTotal += extraLts * beds; extras.push('Dialysis'); }
        if (inputs.cancer) { extraTotal += extraLts * beds; extras.push('Cancer'); }
        if (inputs.surgeries) { extraTotal += extraLts * beds; extras.push('Surgeries'); }
        
        totalLiters = base + extraTotal;
        if (extras.length > 0) {
          breakdown += ' + (' + extras.join(', ') + ': ' + extraTotal + ' L)';
        }
      }
      break;

    case 'Public Toilet':
      const toiletFootfall = inputs.footfall || 0;
      const toiletLts = constants.toilet_lts_pp || 15;
      totalLiters = toiletFootfall * toiletLts;
      breakdown = toiletFootfall + ' footfall * ' + toiletLts + ' L/person';
      break;

    case 'Industries':
      const indType = inputs.industryType || 'STP';
      if (indType === 'STP') {
        const emp = inputs.employees || 0;
        const stpLts = constants.stp_emp_lts || 45;
        totalLiters = emp * stpLts;
        breakdown = 'STP: ' + emp + ' employees * ' + stpLts + ' L/emp';
        if (inputs.kitchen) {
          const kitchenLts = constants.stp_kitchen_lts || 15;
          totalLiters += emp * kitchenLts;
          breakdown += ' + (Kitchen: ' + emp + ' emp * ' + kitchenLts + ' L/emp)';
        }
      } else {
        const waterConsumed = inputs.waterConsumed || 0;
        totalLiters = waterConsumed;
        breakdown = 'ETP: Based on direct water consumed (' + waterConsumed + ' L)';
      }
      break;

    case 'Resorts':
      const rooms = inputs.rooms || 0;
      const persons = constants.resort_persons_pr || 3;
      const resortLts = constants.resort_lts_pp || 80;
      let rBase = rooms * persons * resortLts;
      breakdown = rooms + ' rooms * ' + persons + ' persons/room * ' + resortLts + ' L/person';

      let rExtra = 0;
      let rExtras = [];
      if (inputs.kitchen) {
        const rk = constants.resort_kitchen_lts || 45;
        rExtra += rk * (rooms * persons);
        rExtras.push('Kitchen');
      }
      if (inputs.pool) {
        const rp = constants.resort_pool_lts || 45;
        rExtra += rp * (rooms * persons);
        rExtras.push('Pool');
      }
      
      totalLiters = rBase + rExtra;
      if (rExtras.length > 0) {
        breakdown += ' + (' + rExtras.join(', ') + ' included)';
      }
      break;
  }

  return { totalLiters, breakdown };
}
