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

describe('Flagging an image', () => {

  let browser, agent, lanny;

  beforeEach(done => {
    browser = new Browser({ waitDuration: '30s', loadCss: false });
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


  describe('from show view', () => {

    describe('unauthenticated', () => {
      it('does not allow flagging an image', done => {
        request(app)
          .patch(`/image/${agent.getAgentDirectory()}/image2.jpg/flag`)
          .end((err, res) => {
            if (err) return done.fail(err);
            expect(res.status).toEqual(302);
            expect(res.header.location).toEqual('/');
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
            { path: `uploads/${agent.getAgentDirectory()}/image1.jpg`, photographer: agent._id },
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

      it('renders a form to allow an agent to flag an image', done => {
        browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, err => {
          if (err) return done.fail(err);
          browser.assert.success();
          browser.assert.element('#flag-image-form');
          browser.assert.element(`form[action="/image/${agent.getAgentDirectory()}/image1.jpg/flag?_method=PATCH"][method="post"]`);
          done();
        });
      });

      describe('flagging', () => {
        describe('owner resource', () => {
          beforeEach(done => {
            browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, err => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('redirects to home if the flag is successful', done => {
            browser.pressButton('Flag post', err => {
              if (err) return done.fail(err);

              browser.assert.success();
              browser.assert.text('.alert.alert-success', 'Image flagged');
              browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
              done();
            });
          });


          it('adds agent to list of flaggers and sets flagged attribute', done => {
            models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image1.jpg`}).then(images => {
              expect(images.length).toEqual(1);
              expect(images[0].flagged).toBe(false);
              expect(images[0].flaggers).toEqual([]);

              browser.pressButton('Flag post', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image1.jpg`}).then(images => {
                  expect(images.length).toEqual(1);
                  expect(images[0].flagged).toBe(true);
                  expect(images[0].flaggers).toEqual([agent._id]);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('readable resource', () => {
          beforeEach(done => {
            browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, (err) => {
              if (err) return done.fail(err);
              browser.assert.success();
              done();
            });
          });

          it('shows a flag button', () => {
            browser.assert.element('#flag-image-form');
          });

          it('adds agent to list of flaggers and sets flagged attribute', done => {
            models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
              expect(images.length).toEqual(1);
              expect(images[0].flagged).toBe(false);
              expect(images[0].flaggers).toEqual([]);

              browser.pressButton('Flag post', err => {
                if (err) return done.fail(err);
                browser.assert.success();

                models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
                  expect(images.length).toEqual(1);
                  expect(images[0].flagged).toBe(true);
                  expect(images[0].flaggers).toEqual([agent._id]);

                  done();
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(err => {
              done.fail(err);
            });
          });
        });

        describe('unauthorized resource', function() {
          let troy;
          beforeEach(function(done) {
            models.Agent.findOne({ email: 'troy@example.com' }).then(function(result) {
              troy = result;

              expect(agent.canRead.length).toEqual(1);
              expect(agent.canRead[0]).not.toEqual(troy._id);

              mkdirp(`uploads/${troy.getAgentDirectory()}`, (err) => {
                fs.writeFileSync(`uploads/${troy.getAgentDirectory()}/troy1.jpg`, fs.readFileSync('spec/files/troll.jpg'));

                const images = [
                  { path: `uploads/${troy.getAgentDirectory()}/troy1.jpg`, photographer: troy._id },
                ];
                models.Image.create(images).then(results => {

                  browser.visit(`/image/${troy.getAgentDirectory()}/troy1.jpg`, function(err) {
                    if (err) return done.fail(err);
                    done();
                  });
                }).catch(err => {
                  done.fail(err);
                });
              });
            }).catch(function(error) {
              done.fail(error);
            });
          });

          it('redirects home', () => {
            browser.assert.redirected();
            browser.assert.url({ pathname: '/'});
            browser.assert.text('.alert.alert-danger', 'You are not authorized to access that resource');
          });

          it('does not modify the database record', done => {
            models.Image.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.jpg`}).then(images => {
              expect(images.length).toEqual(1);
              expect(images[0].flagged).toBe(false);
              expect(images[0].flaggers).toEqual([]);

              request(app)
                .patch(`/image/${troy.getAgentDirectory()}/troy1.jpg/flag`)
                .set('Cookie', browser.cookies)
                .expect(302)
                .end((err, res) => {
                  if (err) return done.fail(err);

                  models.Image.find({ path: `uploads/${troy.getAgentDirectory()}/troy1.jpg`}).then(images => {
                    expect(images.length).toEqual(1);
                    expect(images[0].flagged).toBe(false);
                    expect(images[0].flaggers).toEqual([]);

                    done();
                  }).catch(err => {
                    done.fail(err);
                  });
                });
            }).catch(err => {
              done.fail(err);
            });
          });
        });

//        describe('sudo mode', () => {
//
//          afterEach(() => {
//            delete process.env.SUDO;
//          });
//
//          describe('set', () => {
//            describe('non sudo agent', () => {
//
//              beforeEach(() => {
//                process.env.SUDO = 'lanny@example.com';
//                expect(process.env.SUDO).not.toEqual(agent.email);
//              });
//
//              it('doesn\'t render the Flag button', done => {
//                browser.clickLink(`a[href="/image/${agent.getAgentDirectory()}/image1.jpg"]`, (err) => {
//                  if (err) return done.fail(err);
//
//                  browser.assert.success();
//                  browser.assert.elements('#flag-image-form', 0);
//                  done();
//                });
//              });
//
//              it('redirects to the original directory', done => {
//                request(app)
//                  .post(`/image/${agent.getAgentDirectory()}/image2.jpg`)
//                  .set('Cookie', browser.cookies)
//                  .expect(302)
//                  .end((err, res) => {
//                    if (err) return done.fail(err);
//
//                    expect(res.header.location).toEqual(`/image/${agent.getAgentDirectory()}/image2.jpg`);
//                    done();
//                  });
//              });
//
//              it('does not modify the database record\'s path property', done => {
//                models.Image.find({ path: `public/images/uploads/image2.jpg`}).then(images => {
//                  expect(images.length).toEqual(0);
//
//                  models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image2.jpg`}).then(images => {
//                    expect(images.length).toEqual(1);
//                    expect(images[0].flagged).toBe(false);
//
//                    request(app)
//                      .post(`/image/${agent.getAgentDirectory()}/image2.jpg`)
//                      .set('Cookie', browser.cookies)
//                      .expect(302)
//                      .end(function(err, res) {
//                        if (err) return done.fail(err);
//
//                        models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/image2.jpg`}).then(images => {
//                          expect(images.length).toEqual(1);
//                          expect(images[0].flagged).toBe(false);
//
//                          models.Image.find({ path: `public/images/uploads/image2.jpg`}).then(images => {
//                            expect(images.length).toEqual(0);
//
//                            done();
//                          }).catch(err => {
//                            done.fail(err);
//                          });
//                        }).catch(err => {
//                          done.fail(err);
//                        });
//                    });
//                  }).catch(err => {
//                    done.fail(err);
//                  });
//                }).catch(err => {
//                  done.fail(err);
//                });
//              });
//            });
//
//            describe('sudo agent', () => {
//
//              beforeEach(done => {
//                process.env.SUDO = agent.email;
//                browser.visit(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`, (err) => {
//                  if (err) return done.fail(err);
//                  browser.assert.success();
//                  browser.assert.url({ pathname: `/image/${lanny.getAgentDirectory()}/lanny1.jpg` });
//                  done();
//                });
//              });
//
//              it('renders the Flag button', () => {
//                browser.assert.element('#flag-image-form');
//              });
//
//              it('redirects home (i.e., the main photo roll)', done => {
//                browser.assert.url({ pathname: `/image/${lanny.getAgentDirectory()}/lanny1.jpg` });
//                browser.pressButton('Flag', err => {
//                  if (err) return done.fail(err);
//                  browser.assert.success();
//
//                  browser.assert.url({ pathname: '/' });
//                  done();
//                });
//              });
//
//              it('does not point the database path to the public/images/uploads directory', done => {
//                models.Image.find({ path: `public/images/uploads/lanny1.jpg`}).then(images => {
//                  expect(images.length).toEqual(0);
//
//                  models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
//                    expect(images.length).toEqual(1);
//                    expect(images[0].flagged).toBe(false);
//
//                    browser.pressButton('Flag', err => {
//                      if (err) return done.fail(err);
//                      browser.assert.success();
//
//                      models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
//                        expect(images.length).toEqual(1);
//                        expect(images[0].flagged).toBe(true);
//
//                        models.Image.find({ path: `public/images/uploads/lanny1.jpg`}).then(images => {
//                          expect(images.length).toEqual(0);
//
//                          done();
//                        }).catch(err => {
//                          done.fail(err);
//                        });
//                      }).catch(err => {
//                        done.fail(err);
//                      });
//                    });
//                  }).catch(err => {
//                    done.fail(err);
//                  });
//                }).catch(err => {
//                  done.fail(err);
//                });
//              });
//            });
//          });
//        });
      });
    });
  });

  describe('from index view', () => {

//    describe('authenticated', () => {
//      beforeEach(done => {
//        stubAuth0Sessions(agent.email, DOMAIN, err => {
//          if (err) done.fail(err);
//
//          mockAndUnmock({
//            [`uploads/${agent.getAgentDirectory()}`]: {
//              'image1.jpg': fs.readFileSync('spec/files/troll.jpg'),
//              'image2.jpg': fs.readFileSync('spec/files/troll.jpg'),
//              'image3.jpg': fs.readFileSync('spec/files/troll.jpg'),
//            },
//            [`uploads/${lanny.getAgentDirectory()}`]: {
//              'lanny1.jpg': fs.readFileSync('spec/files/troll.jpg'),
//              'lanny2.jpg': fs.readFileSync('spec/files/troll.jpg'),
//              'lanny3.jpg': fs.readFileSync('spec/files/troll.jpg'),
//            },
//            'public/images/uploads': {}
//          });
//
//          const images = [
//            { path: `uploads/${agent.getAgentDirectory()}/image1.jpg`, photographer: agent._id },
//            { path: `uploads/${agent.getAgentDirectory()}/image2.jpg`, photographer: agent._id },
//            { path: `uploads/${agent.getAgentDirectory()}/image3.jpg`, photographer: agent._id },
//            { path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`, photographer: lanny._id },
//            { path: `uploads/${lanny.getAgentDirectory()}/lanny2.jpg`, photographer: lanny._id },
//            { path: `uploads/${lanny.getAgentDirectory()}/lanny3.jpg`, photographer: lanny._id },
//          ];
//          models.Image.create(images).then(results => {
//
//            browser.clickLink('Login', err => {
//              if (err) done.fail(err);
//              browser.assert.success();
//              browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
//              done();
//            });
//          }).catch(err => {
//            done.fail(err);
//          });
//        });
//      });
//
//      afterEach(() => {
//        mock.restore();
//      });
//
//      it('renders forms to allow an agent to delete an image', () => {
//        browser.assert.elements('.flag-image-form', 3);
//        browser.assert.element(`form[action="/image/${agent.getAgentDirectory()}/image1.jpg"][method="post"]`);
//        browser.assert.element(`form[action="/image/${agent.getAgentDirectory()}/image2.jpg"][method="post"]`);
//        browser.assert.element(`form[action="/image/${agent.getAgentDirectory()}/image3.jpg"][method="post"]`);
//      });
//
//      describe('flagging', () => {
//        describe('owner resource', () => {
//          beforeEach(() => {
//            browser.assert.elements('#flag-image-form', 0);
//            browser.assert.elements('.flag-image-form', 3);
//          });
//
//          it('redirects to home if the flag is successful', done => {
//            //
//            // Careful here... this is pressing the first button. There are three Flag buttons
//            //
//            // If this flakes out somehow, remember this:
//            //   browser.document.forms[0].submit();
//            //
//            // 2020-10-2 https://stackoverflow.com/a/40264336/1356582
//            //
//
//            browser.pressButton('Flag', err => {
//              if (err) return done.fail(err);
//
//              browser.assert.success();
//              browser.assert.text('.alert.alert-success', 'Image flagged');
//              browser.assert.url({ pathname: '/' });
//              done();
//            });
//          });
//
//          it('does not delete the image from the agent\'s directory', function(done) {
//            models.Image.find({ photographer: agent._id, flagged: false}).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentImage => {
//              expect(mostRecentImage.length).toEqual(1);
//
//              let filename = mostRecentImage[0].path.split('/');
//              filename = filename[filename.length - 1];
//
//              fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//                if (err) return done.fail(err);
//                expect(files.length).toEqual(3);
//                expect(files.includes(filename)).toBe(true);
//
//                // Cf., Flag notes above
//                browser.pressButton('Flag', function(err) {
//                  if (err) return done.fail(err);
//                  browser.assert.success();
//
//                  fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//                    if (err) return done.fail(err);
//                    expect(files.length).toEqual(3);
//                    expect(files.includes(filename)).toBe(true);
//
//                    done();
//                  });
//                });
//              });
//            }).catch(err => {
//              done.fail(err);
//            });
//          });
//
//          it('does not add the image to the public/images/uploads directory', function(done) {
//            models.Image.find({ photographer: agent._id, flagged: false}).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentImage => {
//              expect(mostRecentImage.length).toEqual(1);
//
//              let filename = mostRecentImage[0].path.split('/');
//              filename = filename[filename.length - 1];
//
//              fs.readdir(`uploads/${agent.getAgentDirectory()}`, (err, files) => {
//                if (err) return done.fail(err);
//                expect(files.length).toEqual(3);
//                expect(files.includes(filename)).toBe(true);
//
//                // Cf., Flag notes above
//                browser.pressButton('Flag', function(err) {
//                  if (err) return done.fail(err);
//                  browser.assert.success();
//
//                  fs.readdir(`public/images/uploads`, (err, files) => {
//                    if (err) return done.fail(err);
//                    expect(files.length).toEqual(0);
//                    expect(files.includes(filename)).toBe(false);
//
//                    done();
//                  });
//                });
//              });
//            }).catch(err => {
//              done.fail(err);
//            });
//          });
//
//          it('does not point the database path to the public/images/uploads directory', done => {
//            models.Image.find({ photographer: agent._id, flagged: false}).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentImage => {
//              expect(mostRecentImage.length).toEqual(1);
//
//              let filename = mostRecentImage[0].path.split('/');
//              filename = filename[filename.length - 1];
//
//              models.Image.find({ path: `public/images/uploads/${filename}`}).then(images => {
//                expect(images.length).toEqual(0);
//
//                models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/${filename}`}).then(images => {
//                  expect(images.length).toEqual(1);
//                  expect(images[0].flagged).toBe(false);
//
//                  browser.pressButton('Flag', err => {
//                    if (err) return done.fail(err);
//                    browser.assert.success();
//
//                    models.Image.find({ path: `uploads/${agent.getAgentDirectory()}/${filename}`}).then(images => {
//                      expect(images.length).toEqual(1);
//                      expect(images[0].flagged).toBe(true);
//
//                      models.Image.find({ path: `public/images/uploads/${filename}`}).then(images => {
//                        expect(images.length).toEqual(0);
//
//                        done();
//                      }).catch(err => {
//                        done.fail(err);
//                      });
//                    }).catch(err => {
//                      done.fail(err);
//                    });
//                  });
//                }).catch(err => {
//                  done.fail(err);
//                });
//              }).catch(err => {
//                done.fail(err);
//              });
//            }).catch(err => {
//              done.fail(err);
//            });
//          });
//        });
//
//        describe('readable resource', () => {
//          beforeEach(done => {
//            browser.visit(`/image/${lanny.getAgentDirectory()}`, (err) => {
//              if (err) return done.fail(err);
//              browser.assert.success();
//              done();
//            });
//          });
//
//          it('does not show a flag button', () => {
//            browser.assert.elements('#flag-image-form', 0);
//            browser.assert.elements('.flag-image-form', 0);
//          });
//
//          it('does not remove the image from the agent\'s directory', function(done) {
//            fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
//              if (err) return done.fail(err);
//              expect(files.length).toEqual(3);
//              expect(files.includes('lanny1.jpg')).toBe(true);
//              expect(files.includes('lanny2.jpg')).toBe(true);
//              expect(files.includes('lanny3.jpg')).toBe(true);
//
//              request(app)
//                .post(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`)
//                .set('Cookie', browser.cookies)
//                .end(function(err, res) {
//                  if (err) return done.fail(err);
//                  expect(res.status).toEqual(302);
//                  expect(res.header.location).toEqual(`/image/${lanny.getAgentDirectory()}`);
//
//                  fs.readdir(`uploads/${lanny.getAgentDirectory()}`, (err, files) => {
//                    if (err) return done.fail(err);
//                    expect(files.length).toEqual(3);
//                    expect(files.includes('lanny1.jpg')).toBe(true);
//                    expect(files.includes('lanny2.jpg')).toBe(true);
//                    expect(files.includes('lanny3.jpg')).toBe(true);
//
//                    fs.readdir(`public/images/uploads`, (err, files) => {
//                      if (err) return done.fail(err);
//                      expect(files.length).toEqual(0);
//                      expect(files.includes('image1.jpg')).toBe(false);
//                      expect(files.includes('image2.jpg')).toBe(false);
//                      expect(files.includes('image3.jpg')).toBe(false);
//
//                      done();
//                    });
//                  });
//                });
//            });
//          });
//
//          it('does not modify the database record\'s path property', done => {
//            models.Image.find({ path: `public/images/uploads/lanny1.jpg`}).then(images => {
//              expect(images.length).toEqual(0);
//
//              models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
//                expect(images.length).toEqual(1);
//                expect(images[0].flagged).toBe(false);
//
//                request(app)
//                  .post(`/image/${lanny.getAgentDirectory()}/lanny1.jpg`)
//                  .set('Cookie', browser.cookies)
//                  .expect(302)
//                  .end(function(err, res) {
//                    if (err) return done.fail(err);
//
//                    models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/lanny1.jpg`}).then(images => {
//                      expect(images.length).toEqual(1);
//                      expect(images[0].flagged).toBe(false);
//
//                      models.Image.find({ path: `public/images/uploads/lanny1.jpg`}).then(images => {
//                        expect(images.length).toEqual(0);
//
//                        done();
//                      }).catch(err => {
//                        done.fail(err);
//                      });
//                    }).catch(err => {
//                      done.fail(err);
//                    });
//                });
//              }).catch(err => {
//                done.fail(err);
//              });
//            }).catch(err => {
//              done.fail(err);
//            });
//          });
//        });
//
//        describe('sudo mode', () => {
//
//          afterEach(() => {
//            delete process.env.SUDO;
//          });
//
//          describe('set', () => {
//            describe('non sudo agent', () => {
//
//              beforeEach(() => {
//                process.env.SUDO = 'lanny@example.com';
//                expect(process.env.SUDO).not.toEqual(agent.email);
//              });
//
//              it('doesn\'t render the Flag buttons', done => {
//                browser.visit(`/image/${agent.getAgentDirectory()}`, (err) => {
//                  browser.assert.url({ pathname: `/image/${agent.getAgentDirectory()}` });
//                  browser.assert.elements('#flag-image-form', 0);
//                  browser.assert.elements('.flag-image-form', 0);
//                  done();
//                });
//              });
//            });
//
//            describe('sudo agent', () => {
//
//              beforeEach(done => {
//                process.env.SUDO = agent.email;
//                browser.visit(`/image/${lanny.getAgentDirectory()}`, err => {
//                  if (err) return done.fail(err);
//                  browser.assert.success();
//                  browser.assert.url({ pathname: `/image/${lanny.getAgentDirectory()}` });
//                  done();
//                });
//              });
//
//              it('renders the Flag button', () => {
//                browser.assert.success();
//                browser.assert.elements('#flag-image-form', 0);
//                browser.assert.elements('.flag-image-form', 3);
//              });
//
//              it('does not point the database path to the public/images/uploads directory', done => {
//                models.Image.find({ photographer: lanny._id, flagged: false}).limit(1).sort({ updatedAt: 'desc' }).then(mostRecentImage => {
//                  expect(mostRecentImage.length).toEqual(1);
//
//                  let filename = mostRecentImage[0].path.split('/');
//                  filename = filename[filename.length - 1];
//
//                  models.Image.find({ path: `public/images/uploads/${filename}`}).then(images => {
//                    expect(images.length).toEqual(0);
//
//                    models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/${filename}`}).then(images => {
//                      expect(images.length).toEqual(1);
//                      expect(images[0].flagged).toBe(false);
//
//                      browser.pressButton('Flag', err => {
//                        if (err) return done.fail(err);
//                        browser.assert.success();
//
//                        models.Image.find({ path: `uploads/${lanny.getAgentDirectory()}/${filename}`}).then(images => {
//                          expect(images.length).toEqual(1);
//                          expect(images[0].flagged).toBe(true);
//
//                          models.Image.find({ path: `public/images/uploads/${filename}`}).then(images => {
//                            expect(images.length).toEqual(0);
//
//                            done();
//                          }).catch(err => {
//                            done.fail(err);
//                          });
//                        }).catch(err => {
//                          done.fail(err);
//                        });
//                      });
//                    }).catch(err => {
//                      done.fail(err);
//                    });
//                  }).catch(err => {
//                    done.fail(err);
//                  });
//                }).catch(err => {
//                  done.fail(err);
//                });
//              });
//            });
//          });
//        });
//      });
//    });
  });
});