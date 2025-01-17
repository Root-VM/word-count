import React, { FC, useEffect, useState } from 'react';
import FileUpload from '../FilesUpload';
import classNames from 'classnames';
import { DatePicker, Input, TreeSelect, Form, Checkbox, Button, Spin } from 'antd';
import moment from 'moment';
import { FormInstance } from 'antd/lib/form';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

import css from './form-calculate.module.scss';
import useTranslation from '../common/translation';
import { useRouter } from 'next/router';
import { filesUpload, filesUploadPage, getLanguages, pusrchased, pusrchasedPage } from '../common/api';
import { alertSuccess } from '../common/alert';

const tProps = {
  treeDefaultExpandAll: false,
  dropdownStyle: { maxHeight: 400, overflow: 'auto' },
  style: { width: '100%' }
};

const cardOptions = {
  style: {
    base: {
      color: 'rgba(0, 0, 0, 0.7)',
      fontSize: '14px',
      fontFamily: 'sans-serif',
      '::placeholder': {
        fontSize: '14px',
        color: 'rgba(0, 0, 0, 0.4)',
      },
    }
  }
};

const FormCalculate: FC<{refresh: any, mainColor: string, secondaryColor: string}> = (props) => {
  const {refresh, mainColor, secondaryColor} = props;
  const [firstStepData, seFirstStepData] = useState<any>({
    lngFrom: 'en',
    lngTo: 'de',
    service: undefined,
    files: '',
    date: moment().add(1,'days').set({h: 12, m: 0})
  });
  const [filesData, setFilesData] = useState<{files: any, price: number, count: number}>
  ({files: [], price: 0, count: 0});
  const [certifyData, setCertifyData] = useState<any>({files: [], price: 0, count: 0, handle: {}});
  const [languageData, setLanguageData] = useState<any>([]);
  const [languageDataServer, setLanguageDataServer] = useState<any>([]);
  const [isFistStep, setFistStep] = useState(true);
  const [fistStepEmitted, setFistStepEmitted] = useState(false);
  const [showService, setShowService] = useState(false);
  const formRef = React.createRef<FormInstance>();
  const [checked, setChecked] = useState(false);
  const [cardError, setCardError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apostille, setApostille] = useState(false);
  const { t } = useTranslation();
  const router = useRouter();

  const subjectAreaData = [
    {value:'translation', title: router.query?.lang !== 'de' ? 'Translation (incl. revision)' : 'Übersetzung (inkl. Revision)'},
    {value:'proofreading', title: router.query?.lang !== 'de' ? 'Proofreading' : 'Korrektur'},
    {value:'certified', title: router.query?.lang !== 'de' ? 'Certified translation' : 'Beglaubigte Übersetzung'},
  ];

  const onCheckboxChange = async (e: any) => {
    await setChecked(e.target.checked);
  };

  // @ts-ignore
  const validation = (rule: any, value: any, callback: (error?: string) => void) => {
    if(checked) {
      return callback()
    }
    return callback(t('mandatory'))
  };

  const languagesInit = () => {
    const lng = router.query?.lang === 'de' ? 'de' : 'en';
    setLanguageData([]);
    if(languageDataServer.length){
      const data = languageDataServer.map((val: any) => {
        return {value: val.code, title: lng === 'de' ? val.title_de : val.title_en}
      });
      setLanguageData(data);
    }
  };

  const loadLanguages = async () => {
    const list = await getLanguages();
    setLanguageDataServer(list?.languages?.length ? list.languages : []);
  };

  useEffect(() => {
    loadLanguages();
  }, []);

  useEffect(() => {
    languagesInit();
  }, [languageDataServer]);

  useEffect(() => {
    languagesInit();

    // reload servise dropdown
    setShowService(false);
    setTimeout(() => {
      setShowService(true);
    });
  }, [router]);

  const getFiles = (e: {files: any, price: number, count: number, isCertified: boolean, handle: any}) => {
    if(e.isCertified) {
      setCertifyData({files: e.files, price: e.price, count: e.count, handle: e.handle});
    } else{
      setFilesData({files: e.files, price: e.price, count: e.count});
    }
  };

  const stripe = useStripe();
  const elements = useElements();

  const cardCheck = () => {
    const cardContainer = document.getElementsByClassName('StripeElement')[0];
    const cardComplete = cardContainer.classList.contains('StripeElement--complete');
    setCardError(!cardComplete);
  };

  const submit = async () => {
    if(isFistStep) {
      setFistStepEmitted(true);
      if(filesData.files.length) {
        setFistStep(false);
      }
    } else {

      const cardContainer = document.getElementsByClassName('StripeElement')[0];
      const cardComplete = cardContainer.classList.contains('StripeElement--complete');
      setCardError(!cardComplete);

      if(cardComplete) {
        try {
          formRef.current!.submit();

          setLoading(true);

          const values = await formRef.current!.validateFields();

          // @ts-ignore
          const cardElement = elements.getElement(CardElement);

          // @ts-ignore
          const paymentMethod = await stripe.createPaymentMethod({
            type: 'card',
            // @ts-ignore
            card: cardElement,
            billing_details: {
              name: `${values.firstname} ${values.lastname}`,
              email: values.email,
            }
          });

          const formData = new FormData();

          for(const file of filesData.files) {
            formData.append('files', file);
          }
          if(firstStepData.service === 'translation') {
            formData.append('translateTo', firstStepData.lngTo);
          }
          formData.append('translateFrom', firstStepData.lngFrom);
          formData.append('type', firstStepData.service);
          formData.append('apostille', String(apostille));

          const payment = firstStepData.service === 'certified' ? await filesUploadPage(formData) : await filesUpload(formData);

          // @ts-ignore
          const stripeData = await stripe.confirmCardPayment(payment.paymentIntent,{
            // @ts-ignore
            payment_method: paymentMethod.paymentMethod.id
          });

          formData.append('paymentIntentSecret', String(stripeData?.paymentIntent?.client_secret));
          formData.append('paymentIntentId', String(stripeData?.paymentIntent?.id));
          formData.append('deliveryTime', firstStepData.date.format());
          formData.append('name', `${values.firstname} ${values.lastname}`);
          formData.append('email', values.email);
          formData.append('phone', values.phone);

          firstStepData.service === 'certified' ? await pusrchasedPage(formData) : await pusrchased(formData);

          alertSuccess(t('paid'));
          refresh();
          setLoading(false);

        } catch (e) {
          console.log('Error----', e);
          setLoading(false);
        }
      } else {
        formRef.current!.submit();
        setLoading(false);
      }
    }
  };


  const stepOne = <div className={css.orange} style={{backgroundColor: mainColor}}>
    <h3>{t("quote")}</h3>

    <div className={css.group}>
      <div>
        <p>{t("service")}</p>
        {/*
          // @ts-ignore */}
        { showService &&
        <TreeSelect value={firstStepData.service} treeData={subjectAreaData} {...tProps}
                    placeholder={t('choose')} onChange={(e:string) => {seFirstStepData({...firstStepData, service: e})}}
        />}
        {!firstStepData.service && fistStepEmitted && <p className={css.errorT}>{t('mandatory')}</p>}
      </div>
      <span />
      <div>
        <p>{t("delivery")}</p>
        <DatePicker showTime showNow={false} defaultValue={firstStepData.date} format="DD.MM.YY" allowClear={false}
                    onChange={(e) => {seFirstStepData({...firstStepData, date: moment(e)})}}/>
      </div>
    </div>

    <p>{t("files")}</p>

    <FileUpload handleChange={getFiles} lngFrom={firstStepData.lngFrom} lngTo={firstStepData.lngTo}
                service={firstStepData.service} apostille={apostille}
                checkError={fistStepEmitted && !filesData.files.length} handleLoading={(e:any) => {setLoading(e)}}
                color={secondaryColor}
    />

    {languageData.length ?
      <div className={classNames(css.group, css.groupArrow)}>
        <div>
          <p>{t("source")}</p>
          {/*
            // @ts-ignore */}
          <TreeSelect value={firstStepData.lngFrom} treeData={languageData} {...tProps}
                      onChange={(e:string) => {seFirstStepData({...firstStepData, lngFrom: e})}}/>
        </div>

        {firstStepData.service !== 'proofreading' &&
        <>
          <span>&#8594;</span>
          <div>
            <p>{t("target")}</p>
            {/*
            // @ts-ignore */}
            <TreeSelect value={firstStepData.lngTo} treeData={languageData} {...tProps}
                        onChange={(e:string) => {seFirstStepData({...firstStepData, lngTo: e})}}/>
          </div>
        </>
        }
      </div> : ''
    }

    {firstStepData.service === 'certified' &&
    <Checkbox onChange={(e:any) => {setApostille(e.target.checked)}} className={css.apostille}>
      {t('apostille')}
      (<a href="https://www.certified-translation.ch/when-is-an-apostille-required/" target="_blank">{t('apostilleLink')}</a>)
    </Checkbox>
    }
  </div>;

  const stepTwo = <Form className={css.orange} ref={formRef} style={{backgroundColor: mainColor}}>
    <p className={css.back} onClick={() => {setFistStep(true); setFistStepEmitted(false)}}><span>&#8592; </span>
      {t('back')}</p>

    <div className={css.group}>
      <div>
        <p>{t("first")}</p>
        <Form.Item name="firstname" rules={[{ required: true, message: t('mandatory') }]}
        ><Input placeholder={t("first")} /></Form.Item>
      </div>
      <span />
      <div>
        <p>{t("last")}</p>
        <Form.Item name="lastname" rules={[{ required: true, message: t('mandatory') }]}
        ><Input placeholder={t("last")} /></Form.Item>
      </div>
    </div>

    <div className={css.group}>
      <div>
        <p>{t("company")} <span>{t("optional")}</span></p>
        <Input placeholder={t("company")}  />
      </div>
    </div>

    <div className={css.group}>
      <div>
        <p>{t("street")}</p>
        <Form.Item name="Street" rules={[{ required: true, message: t('mandatory') }]}
        ><Input placeholder={t("street")} /></Form.Item>
      </div>
      <span />
      <div>
        <p>{t("city")}</p>
        <Form.Item name="City" rules={[{ required: true, message: t('mandatory') }]}
        ><Input placeholder={t("city")} /></Form.Item>
      </div>
    </div>

    <div className={css.group}>
      <div>
        <p>{t("email")}</p>
        <Form.Item name="email" rules={[{ required: true, pattern: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
          message: t('emailError') }]}
        ><Input placeholder={t("email")} /></Form.Item>
      </div>
      <span />
      <div>
        <p>{t("phone")}</p>
        <Form.Item name="phone" rules={[{ required: true, message: t('mandatory') }]}
        ><Input placeholder={t("phone")} /></Form.Item>
      </div>
    </div>

    <p>{t("credit")}</p>
    <CardElement className={css.card} onBlur={cardCheck} onFocus={() => setCardError(false)}
                 options={cardOptions}/>
    {cardError && <span className={css.cardError}>{t('creditError')}</span>}

    <Form.Item name="checkbox"
               rules={[{validator: validation}]}>
      <Checkbox checked={checked} onChange={onCheckboxChange}>
        {t("accept")} <a> {t("term")}</a>
      </Checkbox>
    </Form.Item>
  </Form>;

  return (
    <div className={css.form}>

      <div className={classNames(css.orangeGroup, isFistStep ? '' : css.showNextStep)}>
        {stepOne}
        {stepTwo}
      </div>

      <div className={css.white}>
        {firstStepData.service === 'certified' ?
          <div className={classNames(css.certBlock, certifyData.handle?.total && css.activePrice)}>
            <p>CHF
              <span>{certifyData.handle?.translationPrice ? certifyData.handle?.translationPrice : 0}</span>
            - <span>{t('trPrice')}</span></p>
            <p>CHF
              <span>{certifyData.handle?.certificationPrice ? certifyData.handle?.certificationPrice : 0}</span>
            -<span>{t('certification')}</span></p>
            { apostille &&
              <p>CHF
                <span>{certifyData.handle?.apostille ? certifyData.handle?.apostille : 0}</span>
              - <span>{t('lng') === 'de' ? 'Apostille' : 'Apostille'}</span></p>
            }
            <p>CHF
              <span>{certifyData.handle?.shipping ? certifyData.handle?.shipping : 0}</span>
              - <span>{t('shipping')}</span></p>
            <p>CHF
              <span>{certifyData.handle?.tax ? certifyData.handle?.tax : 0}</span>
              - <span>{t('tax')}</span></p>

            <h3>CHF {certifyData.handle?.total ? certifyData.handle?.total: 0}</h3>
            <p>{t('lng') === 'de' ? 'Seitenzahl' : 'Total pages' }: {certifyData.handle?.pages ? certifyData.handle?.pages : 0}</p>
          </div> : <div>
            <h3>CHF {filesData.price}</h3>
            <p>{t('incl')}. 7.7% {t('vat')}.</p>
            <p>{t('count')}: {filesData.count}</p>
          </div>
        }

        <div>
          <Button type="primary" onClick={submit} style={{backgroundColor: secondaryColor}}>
            {isFistStep ? t('next') : t('order')}
          </Button>
        </div>

        {
          loading &&
          <div className={css.loading}>
            <Spin size="large" />
          </div>
        }
      </div>
    </div>
  );
};

export default FormCalculate;
