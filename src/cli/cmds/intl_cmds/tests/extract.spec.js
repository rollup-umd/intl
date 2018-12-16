/* eslint-disable no-unused-vars */
import React from 'react';
import { shallow } from 'enzyme';
import { FormattedMessage, defineMessages, IntlProvider } from 'react-intl';
import { exec } from 'child_process';
import path from 'path';
import { readFileSync } from 'fs';

/* eslint-disable */
const messages = defineMessages({
  test: {
    id: 'unit.test',
    defaultMessage: 'This is required for unit test.',
  },
});

const basePathProject = path.join(__dirname, '../../../../..');
const pkgProject = require(path.join(basePathProject, 'package.json'));
const defaultLocaleMessages = path.join(basePathProject, `translation/${pkgProject.translation.locale}.json`);

describe('extract', () => {
  beforeEach(() => {
    jest.setTimeout(10000);
  });

  beforeAll((done) => {
    exec('npm run build:lib', () => {
      exec('npm run extract-intl', () => {
        done()
      });
    });
  });

  it('should extract locales', (done) => {
    const renderedComponent = shallow(
      <IntlProvider>
        <FormattedMessage {...messages.test} />
      </IntlProvider>
    );
    expect(renderedComponent.prop('id')).toEqual(messages.test.id);
    expect(renderedComponent.prop('defaultMessage')).toEqual(messages.test.defaultMessage);
    expect(JSON.parse(readFileSync(defaultLocaleMessages, 'utf8'))).toEqual({ 'unit.test': 'This is required for unit test.' });
    done();

  });
});

export default messages;
