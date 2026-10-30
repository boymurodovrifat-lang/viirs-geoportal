"""Run python code/reproduce.py. Frozen-input replay; no network or credentials."""
from pathlib import Path
import json,hashlib,zipfile,sys,importlib.metadata
import numpy as np,pandas as pd,rasterio
from pyproj import Geod
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
P=Path(__file__).resolve().parents[1];I=P/'inputs';O=P/'results';O.mkdir(exist_ok=True);C=P/'_extracted';C.mkdir(exist_ok=True)
for fn,sub in [('background_v11.zip','v11'),('geometry_v12.zip','v12')]:
 with zipfile.ZipFile(I/fn) as z:
  assert all('..' not in Path(n).parts and not n.startswith('/') for n in z.namelist());z.extractall(C/sub)
V=C/'v11';D=C/'v12';G=Geod(ellps='WGS84');W=['Ustyurt','Kyzylkum_west','Kyzylkum_south']
def area(t,h,w):
 out=[]
 for r in range(h):
  n=t.f+r*t.e;s=n+t.e;x=t.c;a,_=G.polygon_area_perimeter([x,x+t.a,x+t.a,x],[s,s,n,n]);out.append(abs(a)/1e6)
 return np.broadcast_to(np.array(out)[:,None],(h,w))
def wq(x,w,p=.5):
 ix=np.argsort(x,kind='stable');return float(x[ix][np.searchsorted(np.cumsum(w[ix]),p*w.sum(),side='left')])
manifest=json.loads((V/'downloads_v11.json').read_text());assert len(manifest)==42
for r in manifest:assert r['sha256']==hashlib.sha256((V/r['file']).read_bytes()).hexdigest()
pts=pd.DataFrame(json.loads((D/'sample_points_v12.json').read_text())).set_index('pid');annual=[];refs=[];rc=[]
for win in W:
 with rasterio.open(V/f'{win}_eligible_v09.tif') as d:elig=d.read(1)==1
 stacks={}
 for y in range(2012,2026):
  with rasterio.open(V/'rasters'/f'{win}_{y}_annual_v11.tif') as d:stacks[y]=d.read();wt=area(d.transform,d.height,d.width)
 fixed=elig.copy()
 for y in range(2013,2026):fixed&=(stacks[y][1]>=30)&(stacks[y][2]>=9)&(stacks[y][0]>=0)
 for y,a in stacks.items():
  m=fixed.copy()
  if y==2012:m&=(a[1]>=30)&(a[2]>=9)&(a[0]>=0)
  r=dict(window=win,year=y,cells=int(m.sum()),area_km2=float(wt[m].sum()))
  for b,key in [(0,'median'),(3,'equal_month_median'),(4,'lunar_median'),(8,'notice_excluded_median')]:
   mm=m&(a[b]>=0);r[key]=wq(a[b][mm],wt[mm])
  annual.append(r)
 r={'window':win}
 for y in [2020,2023]:
  a=stacks[y];m=elig&(a[1]>=30)&(a[0]>=0);r[f'median{y}']=wq(a[0][m],wt[m])
  for pid,pt in pts[pts.window==win].iterrows():
   rr,cc=int(pt.row),int(pt.col);assert fixed[rr,cc];pts.loc[pid,'area_km2']=wt[rr,cc];rc.append(dict(pid=pid,year=y,raster_mean=float(a[0,rr,cc]),raster_count=int(a[1,rr,cc])))
 refs.append(r)
annual=pd.DataFrame(annual);annual.to_csv(O/'annual_reference_series.csv',index=False);refs=pd.DataFrame(refs);refs.to_csv(O/'reference_offsets.csv',index=False)
contr=[]
for win,g in annual[annual.year>=2013].groupby('window',sort=False):
 s=g.set_index('year')['median']
 for y in range(2013,2023):contr.append(dict(window=win,start=y,end=y+3,difference=s[y+3]-s[y]))
contr=pd.DataFrame(contr);contr.to_csv(O/'all_three_year_contrasts.csv',index=False)
with rasterio.open(I/'VIIRS_QA0_2020_2023_native.tif') as d:a=d.read().astype('float64');wt=area(d.transform,d.height,d.width)
m=(a[2]>=30)&(a[3]>=30)&(a[0]>=0)&(a[1]>=0);assert m.sum()==2727284
rows=[]
def scenario(label,t0,t1):
 aa=m&(a[0]>t0);bb=m&(a[1]>t1);x=float(wt[aa].sum());y=float(wt[bb].sum());g=float(wt[bb&~aa].sum());l=float(wt[aa&~bb].sum());assert abs((y-x)-(g-l))<1e-6
 return dict(scenario=label,threshold2020=t0,threshold2023=t1,support_km2=float(wt[m].sum()),area2020_km2=x,area2023_km2=y,gain_km2=g,loss_km2=l,change_pct=100*(y/x-1))
for t in [.5,1,2,3]:rows.append(scenario(f'fixed_{t}',t,t))
for _,r in refs.iterrows():rows.extend([scenario(r.window+'_difference_only',1,1+r.median2023-r.median2020),scenario(r.window+'_two_year',1+r.median2020,1+r.median2023)])
ns=pd.DataFrame(rows);ns.to_csv(O/'national_scenarios.csv',index=False)
bright=[]
for lo,hi in zip([0,.25,.5,1,3,10],[.25,.5,1,3,10,np.inf]):
 mm=m&(a[0]>=lo)&(a[0]<hi);delta=a[1][mm]-a[0][mm];w=wt[mm];bright.append(dict(lower=lo,upper=hi,area_km2=float(w.sum()),median=wq(delta,w),q25=wq(delta,w,.25),q75=wq(delta,w,.75)))
bright=pd.DataFrame(bright);bright.to_csv(O/'brightness_distribution.csv',index=False)
daily=pd.read_csv(D/'Daily_Geometry_2020_2023_v12.csv');assert len(daily)==192*731 and not daily.duplicated(['pid','date']).any();daily['date']=pd.to_datetime(daily.date);daily['quarter']=daily.date.dt.quarter;v=daily[daily.q>=0].copy();assert len(v)==94570
recon=v.groupby(['pid','year']).q.agg(['mean','count']).reset_index().merge(pd.DataFrame(rc),validate='one_to_one',on=['pid','year']);recon['mean_error']=recon['mean']-recon.raster_mean;recon['count_error']=recon['count']-recon.raster_count;assert (recon.count_error==0).all() and recon.mean_error.abs().max()<1.5e-8;recon.to_csv(O/'annual_daily_reconstruction.csv',index=False)
raw=v.groupby(['pid','year']).q.mean().unstack();raw['delta']=raw[2023]-raw[2020]
for win in W:
 mm=v.window==win;b=np.unique(np.quantile(v.loc[mm,'lunar_a2'],[0,.25,.5,.75,1]));v.loc[mm,'c2_lunar_bin']=np.searchsorted(b[1:-1],v.loc[mm,'lunar_a2'],side='left')
settings=[('coarse_q_min1',False,1,True,False),('coarse_q_min3',False,3,True,False),('coarse_q_min5',False,5,True,False),('coarse_noquarter_min3',False,3,False,False),('fine_q_min1',True,1,True,False),('fine_q_min3',True,3,True,False),('fine_q_min5',True,5,True,False),('C2_lunar_q_min3',False,3,True,True),('C2_lunar_q_min5',False,5,True,True)]
summary=[];cells=[]
for label,fine,mindays,quarter,c2 in settings:
 d=v.copy()
 if c2:d['stratum']=d.quarter*10+d.c2_lunar_bin
 else:
  assert d.zenith.between(0,90).all() and d.illumination.between(0,100).all();ze=[10,20,30,40,50] if fine else [20,40];il=[10,25,50,75] if fine else [10,50];d['stratum']=(d.quarter*100 if quarter else 0)+np.searchsorted(ze,d.zenith,side='left')*10+np.searchsorted(il,d.illumination,side='left')
 p=d.groupby(['pid','stratum','year']).agg(n=('q','size'),q=('q','mean'),zenith=('zenith','mean'),illumination=('illumination','mean')).unstack('year').dropna();p=p[(p[('n',2020)]>=mindays)&(p[('n',2023)]>=mindays)];w=np.minimum(p[('n',2020)],p[('n',2023)])
 z=pd.DataFrame({'weight':w,**{k:w*(p[(f,2023)]-p[(f,2020)]) for k,f in [('dq','q'),('dz','zenith'),('di','illumination')]}}).groupby('pid').sum()
 for k,n in [('delta','dq'),('zenith_delta','dz'),('illumination_delta','di')]:z[k]=z[n]/z.weight
 count=d.groupby(['pid','year']).size().unstack()
 for y in [2020,2023]:z[f'fraction{y}']=z.weight/count[y]
 z=z.join(pts[['window','area_km2']]);z['setting']=label;cells.append(z.reset_index())
 for win,g in z.groupby('window',sort=False):
  r=dict(setting=label,window=win,cells=len(g),min_cell_delta=float(g.delta.min()),max_cell_delta=float(g.delta.max()))
  for k in ['delta','zenith_delta','illumination_delta','fraction2020','fraction2023']:r[k]=float(np.average(g[k],weights=g.area_km2))
  summary.append(r)
summary=pd.DataFrame(summary);summary.to_csv(O/'stratification_sensitivity.csv',index=False);pd.concat(cells).to_csv(O/'stratification_per_cell.csv',index=False)
# Synchronous dates across cells preserve spatial dependence. Circular blocks
# are sampled separately by year and quarter. Conditional on fixed cells/QA;
# excludes systematic errors, MNAR bias and cross-year dependence.
B=1999;boot=[]
for block in [7,14,28]:
 rng=np.random.default_rng(20261029+block);means={}
 for y in [2020,2023]:
  dates=pd.date_range(f'{y}-01-01',f'{y}-12-31');q=daily[daily.year==y].pivot(index='pid',columns='date',values='q').reindex(index=pts.index,columns=dates).to_numpy();ok=q>=0;q=np.where(ok,q,0);weights=np.zeros((B,len(dates)),dtype='int16')
  for quarter in range(1,5):
   ix=np.where(dates.quarter==quarter)[0];n=len(ix);starts=rng.integers(0,n,size=(B,int(np.ceil(n/block))));draws=((starts[:,:,None]+np.arange(block))%n).reshape(B,-1)[:,:n]
   for b in range(B):weights[b,ix]=np.bincount(draws[b],minlength=n)
  counts=weights.astype(float)@ok.T;assert (counts>0).all();means[y]=(weights.astype(float)@q.T)/counts
 diff=means[2023]-means[2020]
 for win in W:
  ids=np.where(pts.window.to_numpy()==win)[0];w=pts.iloc[ids].area_km2.to_numpy();dd=np.average(diff[:,ids],axis=1,weights=w);boot.append(dict(window=win,block_days=block,replicates=B,estimate=np.average(raw.loc[pts.iloc[ids].index,'delta'],weights=w),p025=np.quantile(dd,.025),p975=np.quantile(dd,.975),bootstrap_sd=np.std(dd,ddof=1)))
pd.DataFrame(boot).to_csv(O/'seasonal_block_bootstrap.csv',index=False)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':9,'pdf.fonttype':42});colors=['#176b8f','#bc6b23','#54824c'];names=['Ustyurt','Western Kyzylkum','Southern Kyzylkum']
fig,ax=plt.subplots(1,2,figsize=(10.8,4.4))
for win,color,name in zip(W,colors,names):
 g=contr[contr.window==win];ax[0].plot(g.start,g.difference,'o-',color=color,label=name,ms=3,lw=1.2);g=summary[summary.window==win].set_index('setting').loc[['coarse_q_min3','fine_q_min3','C2_lunar_q_min3']];ax[1].plot(range(3),g.delta,'o-',color=color,ms=4)
ax[0].axhline(0,color='#777',lw=.7);ax[0].axvspan(2019.8,2020.2,color='#ddd',alpha=.5);ax[0].set(xlabel='Start year (end = start + 3)',ylabel='Difference of annual spatial medians',title='a  Comparison years',xticks=list(range(2013,2023,2)));ax[0].legend(fontsize=8,frameon=False,loc='upper left')
ax[1].set(xticks=range(3),xticklabels=['Coarse A1\nquarter bins','Finer A1\nquarter bins','A2 lunar\nquarter bins'],ylabel='Standardized mean difference',title='b  Grouping rule (minimum 3 days)',ylim=(.16,.27))
for a0 in ax:a0.spines[['top','right']].set_visible(False);a0.grid(axis='y',alpha=.2)
fig.suptitle('Robustness checks from frozen observations');fig.text(.08,.01,'Radiance: nW cm$^{-2}$ sr$^{-1}$. Panels use different estimands; grouping also changes observation support.',fontsize=8);fig.tight_layout(rect=[0,.05,1,.93]);fig.savefig(O/'Figure_S12_Robustness.png',dpi=220);fig.savefig(O/'Figure_S12_Robustness.pdf');plt.close(fig)
fig,ax=plt.subplots(1,2,figsize=(10.8,4.6));ns=ns.set_index('scenario')
for win,label,color in zip(W,names,colors):ax[0].plot(range(3),[ns.loc[k,'change_pct'] for k in ['fixed_1',win+'_difference_only',win+'_two_year']],'o-',label=label,color=color,ms=4)
ax[1].errorbar(range(6),bright['median'],yerr=[bright['median']-bright.q25,bright.q75-bright['median']],fmt='o',capsize=4,color='#365373');sh=refs.median2023-refs.median2020;ax[1].axhspan(sh.min(),sh.max(),color='#bc6b23',alpha=.3,label='Screened-window shifts')
ax[0].set(xticks=range(3),xticklabels=['Fixed','2023 shift only','Both annual levels'],ylabel='Change in thresholded area (%)',ylim=(0,95),title='a  Background scenarios');ax[1].set(xticks=range(6),xticklabels=['0–0.25','0.25–0.5','0.5–1','1–3','3–10','≥10'],xlabel='2020 radiance class',ylabel='Paired radiance change',title='b  Brightness-conditional change')
for a0 in ax:a0.spines[['top','right']].set_visible(False);a0.grid(axis='y',alpha=.2);a0.legend(frameon=False,fontsize=8)
fig.suptitle('Background assumptions and baseline brightness');fig.tight_layout();fig.savefig(O/'Figure_6_Recomputed.png',dpi=260);fig.savefig(O/'Figure_6_Recomputed.pdf');plt.close(fig)
check=dict(upstream_hashes_verified=42,national_cells=2727284,daily_rows=len(daily),valid_cell_days=len(v),max_mean_reconstruction_error=float(recon.mean_error.abs().max()),count_disagreements=0,bootstrap_replicates=B,status='passed');(O/'checks.json').write_text(json.dumps(check,indent=2));(O/'runtime.json').write_text(json.dumps({'python':sys.version,'packages':{p:importlib.metadata.version(p) for p in ['numpy','pandas','rasterio','pyproj','matplotlib']}},indent=2));print(check)
