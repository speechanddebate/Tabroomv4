<script lang="ts">
import { createRestCircuitsActive } from '#indexcards';
import { handleOrval } from '#lib/helpers/query.ts';
import CircuitsTable from '#lib/components/tables/circuitsTable.svelte';

const circuitsQuery = createRestCircuitsActive(undefined, () => ({ query: { meta: { persist: true } } }));
const circuitsData = $derived(handleOrval(circuitsQuery));

</script>
<div>
	<CircuitsTable {circuitsData}/>
</div>
