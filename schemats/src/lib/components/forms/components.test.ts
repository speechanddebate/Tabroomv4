import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { createRawSnippet } from 'svelte';
import Checkbox from './Checkbox.svelte';
import ChoiceTiles from './ChoiceTiles.svelte';
import FormProblem from './FormProblem.svelte';
import SaveBar from './SaveBar.svelte';
import Select from './Select.svelte';
import Switch from './Switch.svelte';
import TextInput from './TextInput.svelte';

const describedBy = (element: HTMLElement) =>
	(element.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
		.map(id => document.getElementById(id)?.textContent);

describe('TextInput', () => {
	it('is valid and undescribed with no description or error', () => {
		render(TextInput, { props: { label: 'First name' } });
		const input = screen.getByLabelText('First name');

		expect(input).not.toHaveAttribute('aria-invalid');
		expect(input).not.toHaveAttribute('aria-describedby');
	});

	it('marks an error invalid and describes the input with it', () => {
		render(TextInput, { props: { label: 'Phone', description: 'Digits only', error: 'That phone number is in use' } });
		const input = screen.getByLabelText(/Phone/);

		expect(input).toHaveAttribute('aria-invalid', 'true');
		expect(describedBy(input)).toEqual(['Digits only', 'That phone number is in use']);
	});

	it('passes type, required and maxlength to the input', () => {
		render(TextInput, { props: { label: 'Email', type: 'email', required: true, maxlength: 128 } });
		const input = screen.getByLabelText(/Email/);

		expect(input).toHaveAttribute('type', 'email');
		expect(input).toBeRequired();
		expect(input).toHaveAttribute('maxlength', '128');
	});

	it('passes a placeholder to the input, with or without a unit', () => {
		render(TextInput, { props: { label: 'Search paradigms', placeholder: 'Winston Smith', type: 'search' } });
		render(TextInput, { props: { label: 'Bond per judge', placeholder: '0.00', prefix: '$' } });

		expect(screen.getByRole('searchbox', { name: 'Search paradigms' })).toHaveAttribute('placeholder', 'Winston Smith');
		expect(screen.getByLabelText('Bond per judge')).toHaveAttribute('placeholder', '0.00');
	});

	it('reads a unit as part of the description', () => {
		render(TextInput, { props: { label: 'Bond per judge', prefix: '$', description: 'Not a hiring fee', value: '50.00' } });

		expect(screen.getByLabelText('Bond per judge')).toHaveAccessibleDescription('Not a hiring fee $');
	});

	it('keeps a hidden label as the accessible name', () => {
		render(TextInput, { props: { label: 'Rank for Maya Lindqvist', hideLabel: true, size: 'sm' } });

		expect(screen.getByRole('textbox', { name: 'Rank for Maya Lindqvist' })).toHaveClass('h-7');
		expect(screen.getByText('Rank for Maya Lindqvist')).toHaveClass('sr-only');
	});

	it('reveals and hides a password with a toggle that never submits', async () => {
		render(TextInput, { props: { label: 'Password', type: 'password', autocomplete: 'current-password', value: 'correct horse' } });
		const input = screen.getByLabelText('Password');
		const toggle = screen.getByRole('button', { name: 'Show password' });

		expect(input).toHaveAttribute('type', 'password');
		expect(input).not.toHaveAttribute('aria-describedby');
		expect(toggle).toHaveAttribute('type', 'button');
		expect(toggle).toHaveAttribute('aria-pressed', 'false');

		await userEvent.click(toggle);
		expect(input).toHaveAttribute('type', 'text');
		expect(input).toHaveAttribute('autocomplete', 'current-password');
		expect(toggle).toHaveAttribute('aria-pressed', 'true');

		await userEvent.click(toggle);
		expect(input).toHaveAttribute('type', 'password');
	});

	it('reveals only its own password field', async () => {
		render(TextInput, { props: { label: 'New password', type: 'password' } });
		render(TextInput, { props: { label: 'Repeat new password', type: 'password' } });

		await userEvent.click(screen.getAllByRole('button', { name: 'Show password' })[0]);

		expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text');
		expect(screen.getByLabelText('Repeat new password')).toHaveAttribute('type', 'password');
	});

	it('disables the reveal toggle with a disabled password field', () => {
		render(TextInput, { props: { label: 'Password', type: 'password', disabled: true } });

		expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
	});

	it('copies the value and announces it', async () => {
		const user = userEvent.setup();
		render(TextInput, { props: { label: 'Calendar link', copyable: true, value: 'https://www.tabroom.com/cal/123' } });

		expect(screen.getByRole('status')).toHaveTextContent('');
		await user.click(screen.getByRole('button', { name: 'Copy Calendar link' }));

		expect(await navigator.clipboard.readText()).toBe('https://www.tabroom.com/cal/123');
		expect(screen.getByRole('status')).toHaveTextContent('Copied');
	});

	it('says so when the clipboard refuses', async () => {
		const user = userEvent.setup();
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('NotAllowedError'));
		render(TextInput, { props: { label: 'Calendar link', copyable: true, value: 'https://www.tabroom.com/cal/123' } });

		await user.click(screen.getByRole('button', { name: 'Copy Calendar link' }));

		expect(screen.getByRole('status')).toHaveTextContent('Couldn\'t copy');
	});

	it('has no copy button unless copyable', () => {
		render(TextInput, { props: { label: 'Calendar link', value: 'https://www.tabroom.com/cal/123' } });

		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});
});

describe('Switch', () => {
	it('saves the new position and says so', async () => {
		const save = vi.fn().mockResolvedValue(undefined);
		render(Switch, { props: { label: 'Publish the judge list online', save } });

		await userEvent.click(screen.getByRole('switch', { name: 'Publish the judge list online' }));

		expect(save).toHaveBeenCalledWith(true);
		expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
		expect(await screen.findByText('Saved')).toBeInTheDocument();
	});

	it('goes back when the save fails', async () => {
		render(Switch, { props: { label: 'Web alerts', checked: true, save: vi.fn().mockRejectedValue(new Error('offline')) } });

		await userEvent.click(screen.getByRole('switch'));

		expect(await screen.findByText('Not saved')).toBeInTheDocument();
		expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
	});

	it('goes back when the save resolves false', async () => {
		render(Switch, { props: { label: 'Web alerts', save: vi.fn().mockResolvedValue(false) } });

		await userEvent.click(screen.getByRole('switch'));

		await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'));
		expect(screen.getByText('Not saved')).toBeInTheDocument();
	});

	it('shows its settings only in the chosen position', async () => {
		const children = createRawSnippet(() => ({ render: () => '<span>Start judge codes at</span>' }));
		render(Switch, { props: { label: 'Hide judge codes', save: vi.fn().mockResolvedValue(undefined), showChildrenWhen: false, children } });

		expect(screen.getByText('Start judge codes at')).toBeInTheDocument();
		await userEvent.click(screen.getByRole('switch'));
		expect(screen.queryByText('Start judge codes at')).not.toBeInTheDocument();
	});
});

describe('SaveBar', () => {
	it('says everything is saved and disables its buttons with no changes', () => {
		render(SaveBar, { props: { changes: 0, ondiscard: vi.fn() } });

		expect(screen.getByText('All changes saved')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
	});

	it('counts changes and discards them', async () => {
		const ondiscard = vi.fn();
		render(SaveBar, { props: { changes: 2, ondiscard } });

		expect(screen.getByText('2 unsaved changes')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('type', 'submit');
		await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
		expect(ondiscard).toHaveBeenCalledOnce();
	});

	it('locks while saving', () => {
		render(SaveBar, { props: { changes: 1, saving: true, ondiscard: vi.fn() } });

		expect(screen.getByText('Saving')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
	});
});

describe('ChoiceTiles', () => {
	const sides = [
		{ value: 'aff', label: 'Westfield AB', description: 'aff' },
		{ value: 'neg', label: 'Roosevelt CD', description: 'neg' },
	];

	it('picks one tile', async () => {
		render(ChoiceTiles, { props: { label: 'Winner', options: sides } });

		await userEvent.click(screen.getByText('Roosevelt CD'));

		expect(screen.getByRole('radio', { name: 'Roosevelt CD' })).toBeChecked();
		expect(screen.getByRole('radio', { name: 'Westfield AB' })).not.toBeChecked();
		expect(screen.getByRole('radio', { name: 'Roosevelt CD' })).toHaveAccessibleDescription('neg');
	});

	it('describes the group with its error', () => {
		render(ChoiceTiles, { props: { label: 'Winner', options: sides, error: 'Choose the winner' } });

		expect(screen.getByRole('group', { name: 'Winner' })).toHaveAccessibleDescription('Choose the winner');
	});
});

describe('Select', () => {
	const states = [
		{ label: 'United States', options: [{ value: 'NY', label: 'New York' }, { value: 'TX', label: 'Texas' }] },
		{ label: 'Canada', options: [{ value: 'ON', label: 'Ontario' }] },
	];

	it('selects the current value from grouped options', () => {
		const { container } = render(Select, { props: { label: 'State', options: states, value: 'ON' } });

		expect(screen.getByLabelText('State')).toHaveValue('ON');
		expect([...container.querySelectorAll('optgroup')].map(group => group.label)).toEqual(['United States', 'Canada']);
	});

	it('keeps a stored value the options no longer include', () => {
		render(Select, { props: { label: 'State', options: states, value: 'DE-M' } });
		const select = screen.getByLabelText('State');

		expect(select).toHaveValue('DE-M');
		expect(screen.getByRole('option', { name: 'DE-M', selected: true })).toBeInTheDocument();
	});

	it('adds no extra option when the value is listed', () => {
		render(Select, { props: { label: 'State', options: states, value: 'TX' } });

		expect(screen.getAllByRole('option')).toHaveLength(3);
	});

	it('marks an error invalid', () => {
		render(Select, { props: { label: 'State', options: states, value: 'NY', error: 'Pick a state' } });
		const select = screen.getByLabelText('State');

		expect(select).toHaveAttribute('aria-invalid', 'true');
		expect(describedBy(select)).toEqual(['Pick a state']);
	});
});

describe('Checkbox', () => {
	it('labels the box and describes it', () => {
		render(Checkbox, { props: { label: 'No emails', description: 'Tournament mail still comes through', checked: true } });
		const box = screen.getByRole('checkbox', { name: 'No emails' });

		expect(box).toBeChecked();
		expect(describedBy(box)).toEqual(['Tournament mail still comes through']);
	});
});

describe('FormProblem', () => {
	it('renders nothing without a problem', () => {
		render(FormProblem, { props: { problem: null } });

		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('shows the title and detail as an alert', () => {
		render(FormProblem, { props: { problem: { title: 'Request Validation Failed', detail: 'Invalid request body' } } });

		expect(screen.getByRole('alert')).toHaveTextContent('Request Validation Failed');
		expect(screen.getByRole('alert')).toHaveTextContent('Invalid request body');
	});

	it('stays hidden when every issue belongs to a field', () => {
		render(FormProblem, { props: { problem: {
			title  : 'Request Validation Failed',
			issues : [{ path: ['phone'], code: 'custom', message: 'That phone number is in use' }],
		} } });

		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('shows when an issue is about the whole request', () => {
		render(FormProblem, { props: { problem: {
			title  : 'Request Validation Failed',
			issues : [{ path: [], code: 'invalid_type', message: 'Expected an object' }],
		} } });

		expect(screen.getByRole('alert')).toHaveTextContent('Request Validation Failed');
	});
});
