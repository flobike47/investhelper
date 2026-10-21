import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SignalTag } from './SignalTag';

afterEach(cleanup);

describe('SignalTag', () => {
  it.each([
    ['buy', 'Signal haussier'],
    ['hold', 'Neutre'],
    ['sell', 'Signal baissier'],
    ['unknown', '—'],
  ] as const)('affiche un libellé d’indicateur pour %s', (signal, label) => {
    render(<SignalTag signal={signal} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('n’emploie aucun verbe d’injonction', () => {
    const { container } = render(
      <>
        <SignalTag signal="buy" />
        <SignalTag signal="hold" />
        <SignalTag signal="sell" />
      </>,
    );
    expect(container.textContent).not.toMatch(/acheter|conserver|vendre/i);
  });
});
