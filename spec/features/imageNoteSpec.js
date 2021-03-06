'use strict';

const fixtures = require('pow-mongoose-fixtures');
const models = require('../../models');

const app = require('../../app');
const request = require('supertest');

const fs = require('fs');
const mkdirp = require('mkdirp');

const Browser = require('zombie');
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;
const DOMAIN = 'example.com';
Browser.localhost(DOMAIN, PORT);

const stubAuth0Sessions = require('../support/stubAuth0Sessions');

/**
 * `mock-fs` stubs the entire file system. So if a module hasn't
 * already been `require`d the tests will fail because the
 * module doesn't exist in the mocked file system. `ejs` and
 * `iconv-lite/encodings` are required here to solve that
 * problem.
 */
const mock = require('mock-fs');
const mockAndUnmock = require('../support/mockAndUnmock')(mock);


// For when system resources are scarce
jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

describe('Writing note on an image', () => {

  let browser, agent, lanny;

  beforeEach(done => {
    browser = new Browser({ waitDuration: '30s' });
    //browser.debug();
    fixtures.load(__dirname + '/../fixtures/agents.js', models.mongoose, err => {
      models.Agent.findOne({ email: 'daniel@example.com' }).then(results => {
        agent = results;
        models.Agent.findOne({ email: 'lanny@example.com' }).then(results => {
          lanny = results;
          browser.visit('/', err => {
            if (err) return done.fail(err);
            browser.assert.success();
            done();
          });
        }).catch(error => {
          done.fail(error);
        });
      }).catch(error => {
        done.fail(error);
      });
    });
  });

  afterEach(done => {
    models.mongoose.connection.db.dropDatabase().then((err, result) => {
      done();
    }).catch(err => {
      done.fail(err);
    });
  });

  describe('unauthenticated', () => {
    it('does not allow liking an image', done => {
      request(app)
        .post(`/image/${agent.getAgentDirectory()}/image2.jpg/note`)
        .send({ text: 'Groovy, baby! Yeah...' })
        .end((err, res) => {
          if (err) return done.fail(err);
          expect(res.status).toEqual(401);
          expect(res.body.message).toEqual('You are not logged in');
          done();
        });
    });
  });

  describe('authenticated', () => {
    beforeEach(done => {
      stubAuth0Sessions(agent.email, DOMAIN, err => {
        if (err) done.fail(err);

        mockAndUnmock({
          [`uploads/${agent.getAgentDirectory()}`]: {
            'image1.jpg': fs.readFileSync('spec/files/troll.jpg'),
            'image2.jpg': fs.readFileSync('spec/files/troll.jpg'),
            'image3.jpg': fs.readFileSync('spec/files/troll.jpg'),
          },
          [`uploads/${lanny.getAgentDirectory()}`]: {
            'lanny1.jpg': fs.readFileSync('spec/files/troll.jpg'),
            'lanny2.jpg': fs.readFileSync('spec/files/troll.jpg'),
            'lanny3.jpg': fs.readFileSync('spec/files/troll.jpg'),
          },
          'public/images/uploads': {}
        });

        const images = [
          { path: `uploads/${agent.getAgentDirectory()}/image1.jpg`, photographer: agent._id, published: new Date() },
          { path: `uploads/${agent.getAgentDirectory()}/image2.jpg`, photographer: agent._id },
          { path: `uploads/${agent.getAgentDirectory()}/image3.jpg`, photographer: agent._id },
          { path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`, photographer: lanny._id },
          { path: `uploads/${lanny.getAgentDirectory()}/lanny2.jpg`, photographer: lanny._id },
          { path: `uploads/${lanny.getAgentDirectory()}/lanny3.jpg`, photographer: lanny._id },
        ];
        models.Image.create(images).then(results => {

          browser.clickLink('Login', err => {
            if (err) done.fail(err);
            browser.assert.success();
            done();
          });
        }).catch(err => {
          done.fail(err);
        });
      });
    });

    afterEach(() => {
      mock.restore();
    });

    describe('from the landing page', () => {
      beforeEach(done => {
        browser.visit('/', err => {
          if (err) done.fail(err);
          browser.assert.success();
          done();
        });
      });

      it('provides a text field in which to write a note', done => {
        browser.assert.element('article.post');
        browser.assert.element('article.post section.feedback-controls span.accordion i.far.fa-comment');
        browser.assert.element(`article.post section.feedback-controls span.accordion form[action="/image/${agent.getAgentDirectory()}/image1.jpg/note"]`);
        browser.assert.element(`article.post section.feedback-controls span.accordion textarea[name="text"][maxlength="500"]`);
        browser.assert.text(`article.post section.feedback-controls span.accordion form button[type="submit"]`, 'Post');

        done();
      });

      it('does not add a note if the text is empty', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');
        browser.fill('textarea', '  ');
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);

          browser.assert.text('.alert.alert-danger', 'Empty note not saved');
          browser.assert.text('article.post section.feedback-controls i.like-button', '');

          done();
        });
      });

      it('lands in the right place', done => {
        browser.fill('textarea', 'Groovy, baby! Yeah!');
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.assert.text('.alert.alert-success', 'Note posted');
          browser.assert.url({pathname: '/'});

          done();
        });
      });

      it('preserves newline characters in the database', done => {
        let newlines = 'Why\n\nThe\n\nFace\n\n?';
        browser.fill('textarea', newlines);
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          models.Image.find({ published: { $ne: null } }).populate('notes').then(images => {
            expect(images.length).toEqual(1);
            expect(images[0].notes.length).toEqual(1);
            expect(images[0].notes[0].text).toEqual(newlines);

            done();
          }).catch(err => {
            done.fail(err);
          });
        });
      });

      it('preserves newline characters on the display', done => {
        let newlines = 'Why\n\nThe\n\nFace\n\n?';
        browser.fill('textarea', newlines);
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.visit(`/image/${agent.getAgentDirectory()}/image1.jpg`, err => {
            browser.assert.text('.note-content p:first-child', 'Why');
            browser.assert.text('.note-content p:nth-child(2)', 'The');
            browser.assert.text('.note-content p:nth-child(3)', 'Face');
            browser.assert.text('.note-content p:last-child', '?');
            done();
          });
        });
      });

      it('applies markdown to the note content', done => {
        let newlines = '# Why\n\n_The_\n\n ## Face\n\n?';
        browser.fill('textarea', newlines);
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.visit(`/image/${agent.getAgentDirectory()}/image1.jpg`, err => {
            browser.assert.text('.note-content h1', 'Why');
            browser.assert.text('.note-content em', 'The');
            browser.assert.text('.note-content h2', 'Face');
            done();
          });
        });
      });



      it('adds the note to total likes and pluralizes note count', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');

        browser.fill('textarea', 'Groovy, baby! Yeah!');
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);

          browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

          browser.fill('textarea', 'Greetings');
          browser.pressButton('Post', err => {
            if (err) return done.fail(err);

            browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');
            done();
          });
        });
      });

      it('displays note content on image show', done => {
        browser.assert.elements('article.post section.notes', 0);

        browser.fill('textarea', 'Greetings');
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);

          browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, err => {
            if (err) return done.fail(err);
  
            browser.assert.text('article.post section.notes header aside .note-content', 'Greetings');
            done();
          });
        });
      });
    });

    describe('from the show page', () => {
      beforeEach(done => {
        browser.visit(`/image/${agent.getAgentDirectory()}/image1.jpg`, err => {
          if (err) done.fail(err);
          browser.assert.success();
          done();
        });
      });

      it('provides a text field in which to write a note', done => {
        browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}/image1.jpg` });
        browser.assert.element('article.post');
        browser.assert.element('article.post section.feedback-controls span.accordion i.far.fa-comment');
        browser.assert.element(`article.post section.feedback-controls span.accordion form[action="/image/${agent.getAgentDirectory()}/image1.jpg/note"]`);
        browser.assert.element(`article.post section.feedback-controls span.accordion textarea[name="text"][maxlength="500"]`);
        browser.assert.text(`article.post section.feedback-controls span.accordion form button[type="submit"]`, 'Post');

        done();
      });

      it('does not add a note if the text is empty', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');
        browser.fill('textarea', '  ');
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);

          browser.assert.text('.alert.alert-danger', 'Empty note not saved');
          browser.assert.text('article.post section.feedback-controls i.like-button', '');

          done();
        });
      });

      it('lands in the right place', done => {
        browser.fill('textarea', 'Groovy, baby! Yeah!');
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);
          browser.assert.success();

          browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}/image1.jpg` });
          done();
        });
      });

      it('adds the note to total likes and pluralizes note count', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');

        browser.fill('textarea', 'Groovy, baby! Yeah!');
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);

          browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

          browser.fill('textarea', 'Greetings');
          browser.pressButton('Post', err => {
            if (err) return done.fail(err);

            browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');
            done();
          });
        });
      });

      it('displays the new note in a list', done => {
        browser.assert.elements('article.notes section.note', 0);

        browser.fill('textarea', 'Groovy, baby! Yeah!');
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);

          browser.assert.elements('section.notes article.note', 1);
          browser.assert.elements('section.notes article.note header img.avatar', 1);
          browser.assert.elements('section.notes article.note header aside', 1);

          browser.fill('textarea', 'Greetings');
          browser.pressButton('Post', err => {
            if (err) return done.fail(err);

            browser.assert.elements('section.notes article.note', 2);
            browser.assert.elements('section.notes article.note header img.avatar', 2);
            browser.assert.elements('section.notes article.note header aside', 2);
            done();
          });
        });
      });

      it('maintains note count when like is toggled', done => {
        browser.assert.text('article.post section.feedback-controls i.like-button', '');

        browser.fill('textarea', 'Groovy, baby! Yeah!');
        browser.pressButton('Post', err => {
          if (err) return done.fail(err);

          browser.assert.text('article.post section.feedback-controls i.like-button', '1 note');

          browser.fill('textarea', 'Greetings');
          browser.pressButton('Post', err => {
            if (err) return done.fail(err);

            browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');

            // Like
            browser.click('article.post section.feedback-controls i.like-button.fa-heart');
            setTimeout(() => {
              browser.assert.text('article.post section.feedback-controls i.like-button', '3 notes');

              // Un-Like
              browser.click('article.post section.feedback-controls i.like-button.fa-heart');
              setTimeout(() => {
                browser.assert.text('article.post section.feedback-controls i.like-button', '2 notes');

                // Re-Like
                browser.click('article.post section.feedback-controls i.like-button.fa-heart');
                setTimeout(() => {
                  browser.assert.text('article.post section.feedback-controls i.like-button', '3 notes');

                  done();
                }, 250);
              }, 250);
            }, 250);
          });
        });
      });
    });
  });
});
